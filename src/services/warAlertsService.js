// Polling service to compute war alert groups and feed notifications store
import api from './api.js'
import { replaceSourceGroups } from '../stores/notifications'

let intervalId = null

export async function computeWarGroups(rangeStartIso, rangeEndIso) {
  try {
    const [results, eventsInRange] = await Promise.all([
      api.getWarConflictsForRange(rangeStartIso, rangeEndIso),
      api.getEventsForCalendar(rangeStartIso, rangeEndIso)
    ])
    const byId = new Map((eventsInRange || []).map(e => [e.id, e]))
    const overlapHard = new Set()
    const overlapSoft = new Set()
    const steamSoft = new Set()
    const capsHard = new Set()
    const capsSoft = new Set()
    for (const r of (results || [])) {
      if (r?.summaries?.overlaps === 'hard') overlapHard.add(r.event_id)
      else if (r?.summaries?.overlaps === 'soft') overlapSoft.add(r.event_id)
      if (r?.summaries?.steamDupes === 'soft') steamSoft.add(r.event_id)
      if (r?.summaries?.caps === 'hard') capsHard.add(r.event_id)
      if (r?.summaries?.caps === 'soft') capsSoft.add(r.event_id)
    }
    function mapIds(set) {
      return Array.from(set).map(id => {
        const e = byId.get(id) || {}
        return {
          id,
          name: e.name || `Event #${id}`,
          time: e.event_time || '',
          server: e.server_name || '',
          warType: e.war_type || e.war_role || '',
          character: e.character_name || ''
        }
      })
    }
    const groups = []
    if (overlapHard.size) groups.push({ key: 'overlap:hard', title: 'Time Conflict', description: 'Conflicting war times detected.', severity: 'hard', items: mapIds(overlapHard) })
    if (overlapSoft.size) groups.push({ key: 'overlap:soft', title: 'Time Conflict', description: 'Conflicting war times detected.', severity: 'soft', items: mapIds(overlapSoft) })
    if (steamSoft.size) groups.push({ key: 'steamDupes:soft', title: 'Steam Account Conflict', description: 'Pre-slot required for wars of the same type and server using characters on the same Steam account.', severity: 'soft', items: mapIds(steamSoft) })
    if (capsHard.size) {
      const evs = mapIds(capsHard)
      const first = evs[0] || {}
      const wt = first.warType || 'War'
      const ch = first.character || 'this character'
      groups.push({ key: 'caps:hard', title: 'War Limit Reached', description: `${wt} limit reached for ${ch}.`, severity: 'hard', items: evs })
    }
    if (capsSoft.size) {
      const evs = mapIds(capsSoft)
      const first = evs[0] || {}
      const wt = first.warType || 'War'
      const ch = first.character || 'this character'
      groups.push({ key: 'caps:soft', title: 'War Limit Reached', description: `Warning: ${wt} limit will be reached for ${ch}.`, severity: 'soft', items: evs })
    }
    // Server-only
    try {
      const serverOnlyIds = new Set((eventsInRange || []).filter(e => e.event_type === 'War' && (!e.character_id || e.character_id === null) && e.server_name).map(e => e.id))
      if (serverOnlyIds.size) groups.push({ key: 'serverOnly:soft', title: 'Server-only wars', description: 'Reminder: verify daily limits and pre-slots when using a merc/fly-in account.', severity: 'soft', items: mapIds(serverOnlyIds) })
    } catch {}
    // Attach source tag
    const tagged = groups.map(g => ({ ...g, source: 'war' }))
    return tagged
  } catch (e) {
    return []
  }
}

export function startWarAlertsPolling() {
  stopWarAlertsPolling()
  const run = async () => {
    const now = new Date()
    const startIso = now.toISOString()
    const endIso = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
    const groups = await computeWarGroups(startIso, endIso)
    replaceSourceGroups('war', groups)
  }
  run()
  intervalId = setInterval(run, 60000)
}

export function stopWarAlertsPolling() {
  if (intervalId) clearInterval(intervalId)
  intervalId = null
}


