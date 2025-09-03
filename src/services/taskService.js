import database from './database.js'

class TaskService {
    constructor() {
        this.db = database
        this.statementsInitialized = false
        this.statements = {}
    }

    async initStatements() {
        if (this.statementsInitialized) return
        
        // Ensure database is initialized
        await this.db.ensureInitialized()
        
        // Prepare all SQL statements for better performance
        this.statements = {
            insertTask: await this.db.prepare(`
                INSERT INTO tasks (name, description, type, priority, rewards)
                VALUES (?, ?, ?, ?, ?)
            `),
            updateTask: await this.db.prepare(`
                UPDATE tasks 
                SET name = ?, description = ?, type = ?, priority = ?, rewards = ?
                WHERE id = ?
            `),
            deleteTask: await this.db.prepare('DELETE FROM tasks WHERE id = ?'),
            getTaskById: await this.db.prepare('SELECT * FROM tasks WHERE id = ?'),
            getAllTasks: await this.db.prepare('SELECT * FROM tasks ORDER BY priority DESC, name ASC'),
            getTasksByType: await this.db.prepare('SELECT * FROM tasks WHERE type = ? ORDER BY priority DESC, name ASC'),
            getTaskTypeById: await this.db.prepare('SELECT id, type FROM tasks WHERE id = ?'),
            
            // Task assignments
            assignTaskToCharacter: await this.db.prepare(`
                INSERT OR IGNORE INTO task_assignments (task_id, character_id)
                VALUES (?, ?)
            `),
            removeTaskAssignment: await this.db.prepare('DELETE FROM task_assignments WHERE task_id = ? AND character_id = ?'),
            deleteAssignmentsForTask: await this.db.prepare('DELETE FROM task_assignments WHERE task_id = ?'),
            getAssignedCharactersForTask: await this.db.prepare('SELECT character_id FROM task_assignments WHERE task_id = ?'),
            getTaskAssignments: await this.db.prepare(`
                SELECT ta.*, t.name as task_name, t.type, t.priority, c.name as character_name
                FROM task_assignments ta
                JOIN tasks t ON ta.task_id = t.id
                JOIN characters c ON ta.character_id = c.id
                ORDER BY t.priority DESC, t.name ASC
            `),
            getCharacterTasks: await this.db.prepare(`
                SELECT t.*, ta.assigned_at
                FROM tasks t
                JOIN task_assignments ta ON t.id = ta.task_id
                WHERE ta.character_id = ?
                ORDER BY t.priority DESC, t.name ASC
            `),
            getCharacterTimezone: await this.db.prepare('SELECT server_timezone FROM characters WHERE id = ?'),
            getAllCharactersWithTimezone: await this.db.prepare('SELECT id, server_timezone FROM characters'),
            
            // Task completions
            markTaskComplete: await this.db.prepare(`
                INSERT OR REPLACE INTO task_completions (task_id, character_id, reset_period, streak_count)
                VALUES (?, ?, ?, COALESCE(
                    (SELECT streak_count + 1 FROM task_completions 
                     WHERE task_id = ? AND character_id = ? AND reset_period = ?),
                    1
                ))
            `),
            markTaskIncomplete: await this.db.prepare(`
                DELETE FROM task_completions 
                WHERE task_id = ? AND character_id = ? AND reset_period = ?
            `),
            getTaskCompletions: await this.db.prepare(`
                SELECT tc.*, t.name as task_name, t.type, t.priority, c.name as character_name
                FROM task_completions tc
                JOIN tasks t ON tc.task_id = t.id
                JOIN characters c ON tc.character_id = c.id
                WHERE tc.reset_period = ?
                ORDER BY tc.completed_at DESC
            `),
            getCharacterCompletions: await this.db.prepare(`
                SELECT tc.*, t.name as task_name, t.type, t.priority
                FROM task_completions tc
                JOIN tasks t ON tc.task_id = t.id
                WHERE tc.character_id = ? AND tc.reset_period = ?
                ORDER BY tc.completed_at DESC
            `),
            isTaskComplete: await this.db.prepare(`
                SELECT COUNT(*) as completed
                FROM task_completions
                WHERE task_id = ? AND character_id = ? AND reset_period = ?
            `),
            deleteCompletionsForTypeAndPeriod: await this.db.prepare(`
                DELETE FROM task_completions
                WHERE character_id = ? AND reset_period = ?
                  AND task_id IN (SELECT id FROM tasks WHERE type = ?)
            `),
            deleteCompletionsForTypeSimple: await this.db.prepare(`
                DELETE FROM task_completions
                WHERE character_id = ?
                  AND task_id IN (SELECT id FROM tasks WHERE type = ?)
            `),
            
            // Statistics
            getTaskStats: await this.db.prepare(`
                SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN type = 'daily' THEN 1 END) as daily_tasks,
                    COUNT(CASE WHEN type = 'weekly' THEN 1 END) as weekly_tasks,
                    COUNT(CASE WHEN priority = 'Critical' THEN 1 END) as critical_tasks,
                    COUNT(CASE WHEN priority = 'High' THEN 1 END) as high_tasks
                FROM tasks
            `),
            getCompletionStats: await this.db.prepare(`
                SELECT 
                    tc.character_id,
                    c.name as character_name,
                    COUNT(*) as total_completions,
                    COUNT(CASE WHEN t.type = 'daily' THEN 1 END) as daily_completions,
                    COUNT(CASE WHEN t.type = 'weekly' THEN 1 END) as weekly_completions,
                    AVG(tc.streak_count) as avg_streak
                FROM task_completions tc
                JOIN tasks t ON tc.task_id = t.id
                JOIN characters c ON tc.character_id = c.id
                WHERE tc.reset_period = ?
                GROUP BY tc.character_id, c.name
            `)
        }
        
        this.statementsInitialized = true
    }

    async ensureInitialized() {
        await this.db.ensureInitialized()
        await this.initStatements()
    }

    // Task CRUD operations
    async createTask(taskData) {
        await this.ensureInitialized()
        
        const { name, description, type, priority, rewards } = taskData
        
        const result = this.statements.insertTask.run(
            name,
            description || null,
            type,
            priority || 'Medium',
            rewards || null
        )
        
        if (result.changes > 0) {
            return await this.getTaskById(result.lastInsertRowid)
        }
        
        return null
    }

    async updateTask(id, taskData) {
        await this.ensureInitialized()
        
        const { name, description, type, priority, rewards } = taskData
        
        const result = this.statements.updateTask.run(
            name,
            description || null,
            type,
            priority || 'Medium',
            rewards || null,
            id
        )
        
        if (result.changes > 0) {
            return await this.getTaskById(id)
        }
        
        return null
    }

    async deleteTask(id) {
        await this.ensureInitialized()
        
        const result = this.statements.deleteTask.run(id)
        return result.changes > 0
    }

    async getTaskById(id) {
        await this.ensureInitialized()
        
        return this.statements.getTaskById.get(id) || null
    }

    async getAllTasks() {
        await this.ensureInitialized()
        
        return this.statements.getAllTasks.all()
    }

    async getTasksByType(type) {
        await this.ensureInitialized()
        
        return this.statements.getTasksByType.all(type)
    }

    // Task assignment operations
    async assignTaskToCharacter(taskId, characterId) {
        await this.ensureInitialized()
        
        const result = this.statements.assignTaskToCharacter.run(taskId, characterId)
        return result.changes > 0
    }

    async removeTaskAssignment(taskId, characterId) {
        await this.ensureInitialized()
        
        const result = this.statements.removeTaskAssignment.run(taskId, characterId)
        return result.changes > 0
    }

    async assignTaskToCharacters(taskId, characterIds) {
        await this.ensureInitialized()
        const runInsert = this.statements.assignTaskToCharacter
        const tx = this.db.db.transaction((ids) => {
            for (const characterId of ids) {
                runInsert.run(taskId, characterId)
            }
        })
        tx(characterIds)
        return true
    }

    async assignTasksToCharacter(taskIds, characterId) {
        await this.ensureInitialized()
        const runInsert = this.statements.assignTaskToCharacter
        const tx = this.db.db.transaction((ids) => {
            for (const taskId of ids) {
                runInsert.run(taskId, characterId)
            }
        })
        tx(taskIds)
        return true
    }

    async setTaskAssignments(taskId, characterIds) {
        await this.ensureInitialized()
        const deleteAll = this.statements.deleteAssignmentsForTask
        const insert = this.statements.assignTaskToCharacter
        const tx = this.db.db.transaction((ids) => {
            deleteAll.run(taskId)
            for (const characterId of ids) {
                insert.run(taskId, characterId)
            }
        })
        tx(characterIds)
        return true
    }

    async getAssignedCharactersForTask(taskId) {
        await this.ensureInitialized()
        const rows = this.statements.getAssignedCharactersForTask.all(taskId)
        return rows.map(r => r.character_id)
    }

    async getTaskAssignments() {
        await this.ensureInitialized()
        
        return this.statements.getTaskAssignments.all()
    }

    async getCharacterTasks(characterId) {
        await this.ensureInitialized()
        
        return this.statements.getCharacterTasks.all(characterId)
    }

    // Task completion operations
    async markTaskComplete(taskId, characterId, resetPeriod = null) {
        await this.ensureInitialized()
        
        const taskType = this.getTaskType(taskId)
        if (taskType === 'one-time') {
            // For one-time tasks, completion unassigns the task from the character
            const res = this.statements.removeTaskAssignment.run(taskId, characterId)
            return res.changes > 0
        }
        if (!resetPeriod) {
            resetPeriod = this.getResetPeriodForCharacter(characterId, taskType)
        }
        const result = this.statements.markTaskComplete.run(
            taskId, characterId, resetPeriod, taskId, characterId, resetPeriod
        )
        return result.changes > 0
    }

    async markTaskIncomplete(taskId, characterId, resetPeriod = null) {
        await this.ensureInitialized()
        
        const taskType = this.getTaskType(taskId)
        if (taskType === 'one-time') {
            // No-op; once unassigned, there's nothing to mark incomplete
            return true
        }
        if (!resetPeriod) {
            resetPeriod = this.getResetPeriodForCharacter(characterId, taskType)
        }
        const result = this.statements.markTaskIncomplete.run(taskId, characterId, resetPeriod)
        return result.changes > 0
    }

    async isTaskComplete(taskId, characterId, resetPeriod = null) {
        await this.ensureInitialized()
        
        const taskType = this.getTaskType(taskId)
        if (taskType === 'one-time') {
            // Consider one-time task complete if it is no longer assigned to the character
            const assigned = this.db.db.prepare('SELECT 1 FROM task_assignments WHERE task_id = ? AND character_id = ?').get(taskId, characterId)
            return !assigned
        }
        if (!resetPeriod) {
            resetPeriod = this.getResetPeriodForCharacter(characterId, taskType)
        }
        const result = this.statements.isTaskComplete.get(taskId, characterId, resetPeriod)
        return result.completed > 0
    }

    async getTaskCompletions(resetPeriod = null) {
        await this.ensureInitialized()
        
        if (!resetPeriod) {
            resetPeriod = this.getCurrentResetPeriod('daily') // Default to daily
        }
        
        return this.statements.getTaskCompletions.all(resetPeriod)
    }

    async getCharacterCompletions(characterId, resetPeriod = null) {
        await this.ensureInitialized()
        
        if (!resetPeriod) {
            resetPeriod = this.getCurrentResetPeriod('daily') // Default to daily
        }
        
        return this.statements.getCharacterCompletions.all(characterId, resetPeriod)
    }

    // Statistics
    async getTaskStats() {
        await this.ensureInitialized()
        
        return this.statements.getTaskStats.get()
    }

    async getCompletionStats(resetPeriod = null) {
        await this.ensureInitialized()
        
        if (!resetPeriod) {
            resetPeriod = this.getCurrentResetPeriod('daily') // Default to daily
        }
        
        return this.statements.getCompletionStats.all(resetPeriod)
    }

    // Manual reset helpers
    async resetCurrentPeriodForAllCharacters(taskType) {
        await this.ensureInitialized()
        if (taskType !== 'daily' && taskType !== 'weekly') return false
        const rows = this.statements.getAllCharactersWithTimezone.all()
        const runDelete = this.statements.deleteCompletionsForTypeAndPeriod
        const tx = this.db.db.transaction((characters) => {
            for (const ch of characters) {
                const period = this.getResetPeriodForCharacter(ch.id, taskType)
                runDelete.run(ch.id, period, taskType)
            }
        })
        tx(rows)
        return true
    }

    // Simple clear: remove all completions for a character by task type (daily/weekly)
    async clearCompletionsForCharacterByType(characterId, taskType) {
        await this.ensureInitialized()
        if (taskType !== 'daily' && taskType !== 'weekly') return false
        const res = this.statements.deleteCompletionsForTypeSimple.run(characterId, taskType)
        return res.changes >= 0
    }

    // Helper methods
    getTaskType(taskId) {
        const row = this.statements.getTaskTypeById.get(taskId)
        return row?.type || 'daily'
    }

    getResetPeriodForCharacter(characterId, taskType) {
        const tzRow = this.statements.getCharacterTimezone.get(characterId)
        const serverTimezone = tzRow?.server_timezone
        if (!serverTimezone) {
            // Fallback to local
            return this.getLocalResetPeriod(taskType)
        }
        // Compute period tokens using server timezone wall clock, not UTC
        const now = new Date()
        const fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: serverTimezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        })
        const parts = fmt.formatToParts(now)
        const pick = (t) => parts.find(p => p.type === t)?.value
        const y = parseInt(pick('year'), 10)
        const m = parseInt(pick('month'), 10)
        const d = parseInt(pick('day'), 10)
        const H = parseInt(pick('hour'), 10)
        if (taskType === 'weekly') {
            // Determine weekly period anchored at Tuesday 05:00 in server timezone
            // Token format: anchor Tuesday local date (YYYY-MM-DD)
            const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: serverTimezone, weekday: 'short' }).format(now)
            const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }
            const dayNum = map[weekdayStr]
            const dateOnlyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: serverTimezone, year: 'numeric', month: '2-digit', day: '2-digit' })
            const dateParts = dateOnlyFmt.formatToParts(now)
            let cy = parseInt(dateParts.find(p => p.type === 'year').value, 10)
            let cm = parseInt(dateParts.find(p => p.type === 'month').value, 10)
            let cd = parseInt(dateParts.find(p => p.type === 'day').value, 10)
            const deltaFromTuesday = (dayNum - 2 + 7) % 7 // days since last Tuesday
            // Compute last Tuesday local date by subtracting deltaFromTuesday days
            const base = new Date(Date.UTC(cy, cm - 1, cd))
            base.setUTCDate(base.getUTCDate() - deltaFromTuesday)
            // If it's Tuesday but before 05:00 server-local, use previous Tuesday
            const beforeFiveOnTuesday = (dayNum === 2 && H < 5)
            if (beforeFiveOnTuesday) {
                base.setUTCDate(base.getUTCDate() - 7)
            }
            const ay = base.getUTCFullYear()
            const am = base.getUTCMonth() + 1
            const ad = base.getUTCDate()
            return `${ay}-${String(am).padStart(2,'0')}-${String(ad).padStart(2,'0')}`
        }
        // Daily token: if before 05:00 server-local, use previous local day
        if (H >= 5) {
            return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        }
        const prev = new Date(now.getTime() - 24 * 3600 * 1000)
        const prevParts = fmt.formatToParts(prev)
        const py = parseInt(prevParts.find(p => p.type==='year').value, 10)
        const pm = parseInt(prevParts.find(p => p.type==='month').value, 10)
        const pd = parseInt(prevParts.find(p => p.type==='day').value, 10)
        return `${py}-${String(pm).padStart(2,'0')}-${String(pd).padStart(2,'0')}`
    }

    getLocalResetPeriod(taskType) {
        const now = new Date()
        if (taskType === 'weekly') {
            // Local weekly token also uses anchor Tuesday local date
            const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(now)
            const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }
            const dayNum = map[weekday]
            const fmtDate = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
            const parts = fmtDate.formatToParts(now)
            const y = parseInt(parts.find(p => p.type==='year').value, 10)
            const m = parseInt(parts.find(p => p.type==='month').value, 10)
            const d = parseInt(parts.find(p => p.type==='day').value, 10)
            const deltaFromTuesday = (dayNum - 2 + 7) % 7
            const base = new Date(Date.UTC(y, m - 1, d))
            base.setUTCDate(base.getUTCDate() - deltaFromTuesday)
            const H = now.getHours()
            if (dayNum === 2 && H < 5) {
                base.setUTCDate(base.getUTCDate() - 7)
            }
            const ay = base.getUTCFullYear()
            const am = base.getUTCMonth() + 1
            const ad = base.getUTCDate()
            return `${ay}-${String(am).padStart(2,'0')}-${String(ad).padStart(2,'0')}`
        }
        // Daily: use OS local wall clock parts, 05:00 boundary
        const fmt = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        })
        const parts = fmt.formatToParts(now)
        const pick = (t) => parts.find(p => p.type === t)?.value
        let y = parseInt(pick('year'), 10)
        let m = parseInt(pick('month'), 10)
        let d = parseInt(pick('day'), 10)
        const H = parseInt(pick('hour'), 10)
        if (H < 5) {
            const prev = new Date(now.getTime() - 24 * 3600 * 1000)
            const prevParts = fmt.formatToParts(prev)
            y = parseInt(prevParts.find(p => p.type==='year').value, 10)
            m = parseInt(prevParts.find(p => p.type==='month').value, 10)
            d = parseInt(prevParts.find(p => p.type==='day').value, 10)
        }
        return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }

    getTimeInTimezone(timezone, baseDate = new Date()) {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        })
        const parts = formatter.formatToParts(baseDate)
        const y = parts.find(p => p.type === 'year').value
        const m = parts.find(p => p.type === 'month').value
        const d = parts.find(p => p.type === 'day').value
        const hh = parts.find(p => p.type === 'hour').value
        const mm = parts.find(p => p.type === 'minute').value
        const ss = parts.find(p => p.type === 'second').value
        return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`)
    }

    setTime(date, hours, minutes, seconds, ms) {
        const d = new Date(date)
        d.setHours(hours, minutes, seconds, ms)
        return d
    }

    addDays(date, days) {
        const d = new Date(date)
        d.setDate(d.getDate() + days)
        return d
    }

    getTuesdayFiveAMOfWeek(date) {
        const d = new Date(date)
        // Set to 5:00 AM same date first
        d.setHours(5, 0, 0, 0)
        // 0=Sun..6=Sat, we want Tuesday (2)
        const currentDay = d.getDay()
        const deltaToTuesday = (currentDay - 2 + 7) % 7
        const tuesday = new Date(d)
        tuesday.setDate(d.getDate() - deltaToTuesday)
        return tuesday
    }

    getWeekNumber(date) {
        // ISO week number to match Tuesday 05:00 weekly periods
        const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
        // Thursday in current week decides the year
        temp.setUTCDate(temp.getUTCDate() + 3 - (temp.getUTCDay() + 6) % 7)
        const week1 = new Date(Date.UTC(temp.getUTCFullYear(), 0, 4))
        return 1 + Math.round(((temp - week1) / 86400000 - 3 + (week1.getUTCDay() + 6) % 7) / 7)
    }

    // Get tasks with completion status for a character
    async getCharacterTasksWithStatus(characterId) {
        await this.ensureInitialized()
        
        const tasks = await this.getCharacterTasks(characterId)
        const dailyResetPeriod = this.getResetPeriodForCharacter(characterId, 'daily')
        const weeklyResetPeriod = this.getResetPeriodForCharacter(characterId, 'weekly')
        
        return tasks.map(task => {
            if (task.type === 'one-time') {
                // One-time tasks remain visible until user completes them (which unassigns them)
                return { ...task, completed: false, resetPeriod: null }
            }
            const resetPeriod = task.type === 'weekly' ? weeklyResetPeriod : dailyResetPeriod
            const isComplete = this.statements.isTaskComplete.get(task.id, characterId, resetPeriod)
            return {
                ...task,
                completed: isComplete.completed > 0,
                resetPeriod
            }
        })
    }
}

// Export a singleton instance
export default new TaskService() 