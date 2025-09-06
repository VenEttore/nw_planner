import database from './database.js'
import { subMinutes, addMinutes, isBefore, isAfter } from 'date-fns'
import { utcToZonedTime, formatInTimeZone, zonedTimeToUtc } from 'date-fns-tz'

/**
 * War rules conflict detection service
 * - Caps: one Attack and one Defense per character per war day
 * - Steam-linked duplicates: same steam account + same server + same war type → pre-slot warning
 * - Overlaps: player (same character or same steam account) cannot attend overlapping wars
 */
class WarRulesService {
  constructor() {
    this.db = database
    this.statementsInitialized = false
    this.statements = {}
    this.cachedStatuses = null
  }

  async initStatements() {
    if (this.statementsInitialized) return
    await this.db.ensureInitialized()

    this.statements = {
      // Fetch all war events within a broad time window
      getWarEventsBetween: await this.db.prepare(`
        SELECT e.*, c.steam_account_id, c.server_timezone, c.server_name AS character_server_name
        FROM events e
        LEFT JOIN characters c ON c.id = e.character_id
        WHERE e.event_type = 'War'
          AND datetime(e.event_time) >= datetime(?)
          AND datetime(e.event_time) <= datetime(?)
        ORDER BY e.event_time ASC
      `),
      // Fetch war events for a specific character (for caps check)
      getWarEventsForCharacterBetween: await this.db.prepare(`
        SELECT e.*, c.steam_account_id, c.server_timezone, c.server_name AS character_server_name
        FROM events e
        LEFT JOIN characters c ON c.id = e.character_id
        WHERE e.event_type = 'War' AND e.character_id = ?
          AND datetime(e.event_time) >= datetime(?)
          AND datetime(e.event_time) <= datetime(?)
        ORDER BY e.event_time ASC
      `),
      // Participation statuses
      getParticipationStatuses: await this.db.prepare(`
        SELECT name, is_absent FROM participation_statuses
      `)
    }

    this.statementsInitialized = true
  }

  async ensureInitialized() {
    if (!this.statementsInitialized) {
      await this.initStatements()
    }
  }

  async loadStatusesCache() {
    await this.ensureInitialized()
    if (this.cachedStatuses) return this.cachedStatuses
    const rows = this.statements.getParticipationStatuses.all()
    const absent = new Set(rows.filter(r => r.is_absent === 1).map(r => r.name))
    this.cachedStatuses = { absentNames: absent }
    return this.cachedStatuses
  }

  _getServerForCharacter(characterId, nearbyEvents) {
    if (!characterId) return null
    const found = nearbyEvents.find(e => e.character_id === characterId && (e.server_name || e.character_server_name))
    if (found) return found.server_name || found.character_server_name
    try {
      const row = this.db.db.prepare('SELECT server_name FROM characters WHERE id = ?').get(characterId)
      return row?.server_name || null
    } catch (_) { return null }
  }

  _eventServerName(e) { return e?.server_name || e?.character_server_name || null }

  isStatusAbsent(statusName, statusesCache) {
    if (!statusName) return false
    const cache = statusesCache || this.cachedStatuses || { absentNames: new Set() }
    return cache.absentNames.has(statusName)
  }

  buildWarWindow(isoStart) {
    const start = new Date(isoStart)
    return {
      from: subMinutes(start, 15).toISOString(),
      to: addMinutes(start, 30).toISOString()
    }
  }

  windowsOverlap(a, b) {
    const aFrom = new Date(a.from)
    const aTo = new Date(a.to)
    const bFrom = new Date(b.from)
    const bTo = new Date(b.to)
    return !(isBefore(aTo, bFrom) || isAfter(aFrom, bTo))
  }

  warDayToken(isoDateTime, tz) {
    const zone = tz || 'UTC'
    return formatInTimeZone(new Date(isoDateTime), zone, 'yyyy-MM-dd')
  }

  getLocalDayBoundsUtc(isoDateTime, tz) {
    const zone = tz || 'UTC'
    const zoned = utcToZonedTime(new Date(isoDateTime), zone)
    const startLocal = new Date(zoned)
    startLocal.setHours(0, 0, 0, 0)
    const endLocal = new Date(zoned)
    endLocal.setHours(23, 59, 59, 999)
    const startUtc = zonedTimeToUtc(startLocal, zone).toISOString()
    const endUtc = zonedTimeToUtc(endLocal, zone).toISOString()
    return { startUtc, endUtc }
  }

  summarizeSeverity(events, statusesCache) {
    const confirmedCount = events.filter(e => e.participation_status === 'Confirmed').length
    const nonAbsentCount = events.filter(e => !this.isStatusAbsent(e.participation_status, statusesCache)).length
    let severity = 'none'
    if (confirmedCount >= 2) severity = 'hard'
    else if (confirmedCount === 1 && nonAbsentCount >= 2) severity = 'soft'
    return { severity, confirmedCount, nonAbsentCount }
  }

  /**
   * Get conflicts for a single (potential) event described by dto
   * dto: { id?, event_type, war_type, character_id, server_name, event_time, timezone, participation_status }
   */
  async getWarConflictsForEvent(dto) {
    await this.ensureInitialized()
    const statusesCache = await this.loadStatusesCache()

    const eventTimeIso = dto?.event_time
    if (!eventTimeIso) return { caps: [], steamDupes: [], overlaps: [], summaries: { overlaps: 'none', steamDupes: 'none', caps: 'none' } }

    const candidate = {
      id: dto?.id || null,
      war_type: dto?.war_type || dto?.war_role || 'Unspecified',
      character_id: dto?.character_id || null,
      server_name: dto?.server_name || null,
      event_time: eventTimeIso,
      timezone: dto?.timezone || 'UTC',
      participation_status: dto?.participation_status || 'Signed Up'
    }

    // Fill missing server_name from character when possible
    if (!candidate.server_name && candidate.character_id) {
      candidate.server_name = this._getServerForCharacter(candidate.character_id, nearby)
    }

    const candidateWindow = this.buildWarWindow(candidate.event_time)

    // Load a 4-hour window around the candidate time to filter for overlaps
    const fourHoursBefore = subMinutes(new Date(candidate.event_time), 240).toISOString()
    const fourHoursAfter = addMinutes(new Date(candidate.event_time), 240).toISOString()
    const nearby = this.statements.getWarEventsBetween.all(fourHoursBefore, fourHoursAfter)
      .filter(e => e.id !== candidate.id)

    // Overlaps: same character OR same steam account
    const overlapping = nearby.filter(e => {
      const w = this.buildWarWindow(e.event_time)
      // If candidate has a character, compare by same character OR same steam
      if (candidate.character_id) {
        const candSteam = this._getSteamForCharacter(candidate.character_id, nearby)
        return this.windowsOverlap(candidateWindow, w) && (
          (e.character_id && e.character_id === candidate.character_id) ||
          (candSteam && (e.steam_account_id || this._getSteamForCharacter(e.character_id, nearby)) === candSteam)
        )
      }
      // If no character (server-only), overlaps cannot be attributed to a player; skip
      return false
    })

    // Severity for overlaps considers both candidate and overlapping events
    const overlapSeverity = this.summarizeSeverity([candidate, ...overlapping], statusesCache)

    // Steam duplicates: same steam account + same server + same war_type
    let steamDupes = []
    if (candidate.character_id && candidate.server_name && (candidate.war_type === 'Attack' || candidate.war_type === 'Defense')) {
      const candidateSteam = this._getSteamForCharacter(candidate.character_id, nearby)
      if (candidateSteam) {
        steamDupes = nearby.filter(e => {
          const type = (e.war_type || e.war_role || 'Unspecified')
          const eSteam = e.steam_account_id || this._getSteamForCharacter(e.character_id, nearby)
          if (!eSteam) return false
          if (!this.windowsOverlap(candidateWindow, this.buildWarWindow(e.event_time))) return false
          const eServer = this._eventServerName(e)
          return (eSteam === candidateSteam && eServer && eServer === candidate.server_name && type === candidate.war_type)
        })
      }
    }
    const steamParticipants = [candidate, ...steamDupes]
    const steamNonAbsent = steamParticipants.filter(e => !this.isStatusAbsent(e.participation_status, statusesCache))
    const steamSeverity = steamDupes.length > 0 && steamNonAbsent.length >= 2 ? 'soft' : 'none'

    // Caps: per character per war day per type
    let caps = []
    let capSeverity = 'none'
    if (candidate.character_id && (candidate.war_type === 'Attack' || candidate.war_type === 'Defense')) {
      const tz = candidate.timezone || 'UTC'
      const dayToken = this.warDayToken(candidate.event_time, tz)
      const { startUtc, endUtc } = this.getLocalDayBoundsUtc(candidate.event_time, tz)
      const sameChar = this.statements.getWarEventsForCharacterBetween.all(candidate.character_id, startUtc, endUtc)
      const sameTypeSameDay = sameChar.filter(e => {
        const token = this.warDayToken(e.event_time, tz)
        const type = (e.war_type || e.war_role || 'Unspecified')
        return token === dayToken && type === candidate.war_type && e.id !== candidate.id
      })
      if (sameTypeSameDay.length >= 1) {
        caps = sameTypeSameDay
        capSeverity = 'hard'
      }
    }

    return {
      caps,
      steamDupes,
      overlaps: overlapping,
      summaries: {
        overlaps: overlapSeverity.severity,
        steamDupes: steamSeverity,
        caps: capSeverity
      }
    }
  }

  _getSteamForCharacter(characterId, nearbyEvents) {
    // Try to infer from nearbyEvents payloads (joined with characters), else query directly
    const found = nearbyEvents.find(e => e.character_id === characterId && e.steam_account_id)
    if (found && found.steam_account_id) return found.steam_account_id
    try {
      const row = this.db.db.prepare('SELECT steam_account_id FROM characters WHERE id = ?').get(characterId)
      return row?.steam_account_id || null
    } catch (_) {
      return null
    }
  }

  /**
   * Batch conflicts for events in a date range (ISO strings)
   * Returns array of { event_id, summaries: { caps, steamDupes, overlaps }, counts }
   */
  async getWarConflictsForRange(startIso, endIso) {
    await this.ensureInitialized()
    const statusesCache = await this.loadStatusesCache()
    const events = this.statements.getWarEventsBetween.all(startIso, endIso)
    const results = []

    for (const ev of events) {
      const dto = {
        id: ev.id,
        event_type: ev.event_type,
        war_type: ev.war_type || ev.war_role || 'Unspecified',
        character_id: ev.character_id,
        server_name: ev.server_name,
        event_time: ev.event_time,
        timezone: ev.timezone,
        participation_status: ev.participation_status
      }
      const conflicts = await this.getWarConflictsForEvent(dto)
      const hardCount = (conflicts.summaries.caps === 'hard' ? 1 : 0) + (conflicts.summaries.overlaps === 'hard' ? 1 : 0)
      const softCount = (conflicts.summaries.steamDupes === 'soft' ? 1 : 0) + (conflicts.summaries.overlaps === 'soft' ? 1 : 0)
      results.push({
        event_id: ev.id,
        caps: conflicts.caps.map(c => c.id),
        steamDupes: conflicts.steamDupes.map(c => c.id),
        overlaps: conflicts.overlaps.map(c => c.id),
        summaries: conflicts.summaries,
        counts: { hard: hardCount, soft: softCount }
      })
    }

    return results
  }
}

// Export singleton
const warRulesService = new WarRulesService()
export default warRulesService


