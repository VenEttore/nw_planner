import TimeZoneService from './timezone.js'

class ResetTimerService {
    constructor() {
        this.intervals = new Map()
        this.callbacks = new Map()
    }

    // Calculate time until next daily reset (5 AM server time)
    getTimeUntilDailyReset(serverName) {
        const nextResetUTC = TimeZoneService.getNextResetUTC(serverName, 'daily')
        const now = new Date()
        const timeDiff = nextResetUTC.getTime() - now.getTime()
        return this.formatTimeRemaining(timeDiff)
    }

    // Calculate time until next weekly reset (Tuesday 5 AM server time)
    getTimeUntilWeeklyReset(serverName) {
        const nextResetUTC = TimeZoneService.getNextResetUTC(serverName, 'weekly')
        const now = new Date()
        const timeDiff = nextResetUTC.getTime() - now.getTime()
        return this.formatTimeRemaining(timeDiff)
    }

    // Get current server time
    getServerTime(serverName, localTime = new Date()) {
        const serverTimezone = TimeZoneService.serverTimeZones[serverName]
        if (!serverTimezone) {
            // fallback: return local time (used only by legacy name callers)
            return localTime
        }
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: serverTimezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        })
        const parts = formatter.formatToParts(localTime)
        const y = parts.find(p => p.type === 'year').value
        const m = parts.find(p => p.type === 'month').value
        const d = parts.find(p => p.type === 'day').value
        const hh = parts.find(p => p.type === 'hour').value
        const mm = parts.find(p => p.type === 'minute').value
        const ss = parts.find(p => p.type === 'second').value
        return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`)
    }

    // Convert server time back to local time
    convertFromServerTime(serverName, serverTime) {
        const serverTimezone = TimeZoneService.serverTimeZones[serverName]
        if (!serverTimezone) {
            throw new Error(`Unknown server: ${serverName}`)
        }

        // This is a simplified conversion - for production use a proper timezone library
        const utcTime = new Date(serverTime.toISOString())
        return utcTime
    }

    // Format time remaining into human readable format
    formatTimeRemaining(milliseconds) {
        if (milliseconds <= 0) {
            return { hours: 0, minutes: 0, seconds: 0, totalMs: 0 }
        }

        const totalSeconds = Math.floor(milliseconds / 1000)
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60

        return {
            hours,
            minutes,
            seconds,
            totalMs: milliseconds,
            formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        }
    }

    // Get formatted server time display
    getServerTimeDisplay(serverName) {
        const tz = TimeZoneService.serverTimeZones[serverName]
        if (!tz) {
            return { time: new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false}), date: new Date().toLocaleDateString('en-US', {month:'short', day:'numeric'}), timezone: 'Unknown' }
        }
        return TimeZoneService.getServerTimeDisplayByTimezone(tz)
    }

    // Start real-time updates for reset timers
    startResetTimer(serverName, callback) {
        const timerId = `${serverName}_reset_timer`
        
        // Clear existing timer if any
        if (this.intervals.has(timerId)) {
            clearInterval(this.intervals.get(timerId))
        }

        // Set up new timer that updates every second
        const interval = setInterval(() => {
            try {
                const dailyReset = this.getTimeUntilDailyReset(serverName)
                const weeklyReset = this.getTimeUntilWeeklyReset(serverName)
                const serverTime = this.getServerTimeDisplay(serverName)

                callback({
                    server: serverName,
                    daily: dailyReset,
                    weekly: weeklyReset,
                    serverTime: serverTime,
                    timestamp: Date.now()
                })
            } catch (error) {
                console.error(`Error updating reset timer for ${serverName}:`, error)
            }
        }, 1000)

        this.intervals.set(timerId, interval)
        this.callbacks.set(timerId, callback)

        // Trigger immediate update
        try {
            const dailyReset = this.getTimeUntilDailyReset(serverName)
            const weeklyReset = this.getTimeUntilWeeklyReset(serverName)
            const serverTime = this.getServerTimeDisplay(serverName)

            callback({
                server: serverName,
                daily: dailyReset,
                weekly: weeklyReset,
                serverTime: serverTime,
                timestamp: Date.now()
            })
        } catch (error) {
            console.error(`Error in initial reset timer update for ${serverName}:`, error)
        }

        return timerId
    }

    // New timezone-first helpers
    startResetTimerForServer(server, callback) {
        const { name, timezone } = server
        const timerId = `${name}_reset_timer`
        if (this.intervals.has(timerId)) {
            clearInterval(this.intervals.get(timerId))
        }
        const tick = () => {
            try {
                const daily = TimeZoneService.getTimeUntilResetByTimezone(timezone, 'daily')
                const weekly = TimeZoneService.getTimeUntilResetByTimezone(timezone, 'weekly')
                const serverTime = TimeZoneService.getServerTimeDisplayByTimezone(timezone)
                callback({ server: name, daily, weekly, serverTime, timestamp: Date.now() })
            } catch (e) { console.error('Reset timer tick failed:', e) }
        }
        const interval = setInterval(tick, 1000)
        this.intervals.set(timerId, interval)
        this.callbacks.set(timerId, callback)
        tick()
        return timerId
    }

    // Stop reset timer
    stopResetTimer(timerId) {
        if (this.intervals.has(timerId)) {
            clearInterval(this.intervals.get(timerId))
            this.intervals.delete(timerId)
            this.callbacks.delete(timerId)
        }
    }

    // Stop all timers
    stopAllTimers() {
        for (const [timerId, interval] of this.intervals) {
            clearInterval(interval)
        }
        this.intervals.clear()
        this.callbacks.clear()
    }

    // Get reset information for multiple servers
    getMultiServerResetInfo(serverNamesOrServers) {
        return serverNamesOrServers.map(item => {
            const asObj = typeof item === 'string' ? { name: item, timezone: TimeZoneService.serverTimeZones[item] } : item
            const { name, timezone } = asObj || {}
            try {
                if (!timezone) throw new Error('Missing timezone')
                return { server: name, daily: TimeZoneService.getTimeUntilResetByTimezone(timezone, 'daily'), weekly: TimeZoneService.getTimeUntilResetByTimezone(timezone, 'weekly'), serverTime: TimeZoneService.getServerTimeDisplayByTimezone(timezone), error: null }
            } catch (error) {
                return { server: name || String(item), daily: null, weekly: null, serverTime: null, error: error.message }
            }
        })
    }

    // Check if it's currently reset time (within 5 minutes of reset)
    isResetTime(serverName, type = 'daily') {
        try {
            const resetInfo = type === 'daily' 
                ? this.getTimeUntilDailyReset(serverName)
                : this.getTimeUntilWeeklyReset(serverName)
            
            // Consider it "reset time" if less than 5 minutes remaining
            return resetInfo.totalMs <= (5 * 60 * 1000)
        } catch (error) {
            return false
        }
    }

    // Get next reset periods for database queries
    getResetPeriods(serverName) {
        const tz = TimeZoneService.serverTimeZones[serverName]
        const now = new Date()
        const fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        })
        const parts = fmt.formatToParts(now)
        const pick = (t) => parts.find(p => p.type === t)?.value
        const y = parseInt(pick('year'), 10)
        const m = parseInt(pick('month'), 10)
        const d = parseInt(pick('day'), 10)
        const H = parseInt(pick('hour'), 10)

        // Daily period (yyyy-MM-dd) in server-local time
        let dailyY = y, dailyM = m, dailyD = d
        if (H < 5) {
            const prev = new Date(now.getTime() - 24 * 3600 * 1000)
            const prevParts = fmt.formatToParts(prev)
            dailyY = parseInt(prevParts.find(p => p.type==='year').value, 10)
            dailyM = parseInt(prevParts.find(p => p.type==='month').value, 10)
            dailyD = parseInt(prevParts.find(p => p.type==='day').value, 10)
        }
        const dailyPeriod = `${dailyY}-${String(dailyM).padStart(2,'0')}-${String(dailyD).padStart(2,'0')}`

        // Weekly period anchored to Tuesday 05:00 server-local (token = Tuesday YYYY-MM-DD)
        const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now)
        const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }
        const dayNum = map[weekdayStr]
        const dateOnlyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        const dateParts = dateOnlyFmt.formatToParts(now)
        const cy = parseInt(dateParts.find(p => p.type === 'year').value, 10)
        const cm = parseInt(dateParts.find(p => p.type === 'month').value, 10)
        const cd = parseInt(dateParts.find(p => p.type === 'day').value, 10)
        const deltaToTuesday = (dayNum - 2 + 7) % 7
        const tuesdayUTC = new Date(Date.UTC(cy, cm - 1, cd))
        tuesdayUTC.setUTCDate(tuesdayUTC.getUTCDate() - deltaToTuesday)
        const beforeFiveOnTuesday = (dayNum === 2 && H < 5)
        if (beforeFiveOnTuesday) {
            tuesdayUTC.setUTCDate(tuesdayUTC.getUTCDate() - 7)
        }
        const wy = tuesdayUTC.getUTCFullYear()
        const wm = tuesdayUTC.getUTCMonth() + 1
        const wd = tuesdayUTC.getUTCDate()
        const weeklyPeriod = `${wy}-${String(wm).padStart(2,'0')}-${String(wd).padStart(2,'0')}`

        return { daily: dailyPeriod, weekly: weeklyPeriod }
    }

    // Get ISO week number
    getWeekNumber(date) {
        const target = new Date(date.valueOf())
        const dayNr = (date.getDay() + 6) % 7
        target.setDate(target.getDate() - dayNr + 3)
        const firstThursday = target.valueOf()
        target.setMonth(0, 1)
        if (target.getDay() !== 4) {
            target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
        }
        return 1 + Math.ceil((firstThursday - target) / 604800000)
    }
}

// Export a singleton instance
export default new ResetTimerService() 