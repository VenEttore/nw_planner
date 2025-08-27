import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class DatabaseService {
    constructor() {
        this.db = null
        this.initialized = false
    }

    async init(userDataPath = null) {
        if (this.initialized) return
        
        // Use provided path or default to user data directory
        let dbPath
        if (userDataPath) {
            dbPath = path.join(userDataPath, 'nw_planner.db')
        } else {
            // Fallback for development/web mode
            const homeDir = os.homedir()
            const appDataDir = path.join(homeDir, '.nw-planner')
            
            // Create directory if it doesn't exist
            try {
                const fs = await import('fs')
                await fs.promises.mkdir(appDataDir, { recursive: true })
            } catch (error) {
                console.error('Error creating app data directory:', error)
            }
            
            dbPath = path.join(appDataDir, 'nw_planner.db')
        }
        
        console.log('Initializing database at:', dbPath)
        this.db = new Database(dbPath)
        
        // Enable foreign keys
        this.db.pragma('foreign_keys = ON')
        
        // Create tables
        this.createTables()
        
        this.initialized = true
    }

    createTables() {
        // Servers table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                region TEXT NOT NULL CHECK(region IN ('AP Southeast', 'SA East', 'US West', 'US East', 'EU Central')),
                timezone TEXT NOT NULL,
                active_status BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Characters table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS characters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                server_name TEXT NOT NULL,
                server_timezone TEXT NOT NULL,
                faction TEXT CHECK(faction IN ('Factionless', 'Marauders', 'Covenant', 'Syndicate')) DEFAULT 'Factionless',
                company TEXT,
                active_status BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT,
                avatar_path TEXT
            )
        `)

        // Task definitions
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                type TEXT CHECK(type IN ('daily', 'weekly', 'one-time')) NOT NULL,
                priority TEXT CHECK(priority IN ('Low', 'Medium', 'High', 'Critical')) DEFAULT 'Medium',
                rewards TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Task assignments to characters
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS task_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(task_id, character_id)
            )
        `)

        // Task completion tracking
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS task_completions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reset_period TEXT NOT NULL,
                streak_count INTEGER DEFAULT 1,
                UNIQUE(task_id, character_id, reset_period)
            )
        `)

        // Events table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                event_type TEXT NOT NULL,
                server_name TEXT,
                event_time TIMESTAMP NOT NULL,
                timezone TEXT NOT NULL,
                character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
                participation_status TEXT DEFAULT 'Signed Up',
                location TEXT,
                recurring_pattern TEXT,
                notification_enabled BOOLEAN DEFAULT 1,
                notification_minutes INTEGER DEFAULT 30,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Event templates table (lean schema)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS event_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                event_type TEXT,
                description TEXT,
                location TEXT,
                participation_status TEXT DEFAULT 'Signed Up',
                notification_enabled BOOLEAN DEFAULT 1,
                notification_minutes INTEGER DEFAULT 30,
                time_strategy TEXT CHECK(time_strategy IN ('relative','fixed')) DEFAULT NULL,
                time_params TEXT,
                payload_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Create indexes for performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_servers_region ON servers(region);
            CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name);
            CREATE INDEX IF NOT EXISTS idx_characters_server ON characters(server_name);
            CREATE INDEX IF NOT EXISTS idx_task_completions_character ON task_completions(character_id);
            CREATE INDEX IF NOT EXISTS idx_task_completions_reset_period ON task_completions(reset_period);
            CREATE INDEX IF NOT EXISTS idx_events_character ON events(character_id);
            CREATE INDEX IF NOT EXISTS idx_events_time ON events(event_time);
            CREATE INDEX IF NOT EXISTS idx_event_templates_name ON event_templates(name);
        `)

        // Create triggers for timestamp updates
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS update_character_timestamp 
                BEFORE UPDATE ON characters 
                FOR EACH ROW 
                BEGIN
                    UPDATE characters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END;
        `)

        // Apply lightweight migrations
        this.migrateTasksTableForOneTime()
        this.migrateEventTemplatesAddPayload()
        this.migrateEventTemplatesPruneLegacy()
        this.migrateParticipationStatuses()
        this.migrateDropStatusChecks()

        // Note: Default tasks are no longer automatically inserted to keep the app clean
        // Users can manually add tasks or import data if needed
    }

    // Create participation_statuses table and seed defaults
    migrateParticipationStatuses() {
        try {
            const exists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='participation_statuses'").get()
            if (exists) return
            this.db.exec(`
                CREATE TABLE participation_statuses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    slug TEXT NOT NULL UNIQUE,
                    color_bg TEXT NOT NULL,
                    color_text TEXT NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    is_absent BOOLEAN NOT NULL DEFAULT 0,
                    is_default BOOLEAN NOT NULL DEFAULT 0
                );
                CREATE INDEX idx_participation_statuses_sort ON participation_statuses(sort_order);
            `)
            const seed = this.db.prepare('INSERT INTO participation_statuses (name, slug, color_bg, color_text, sort_order, is_absent, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)')
            const defaults = [
                ['Signed Up','signed_up','bg-blue-50','text-blue-800',10,0,1],
                ['Confirmed','confirmed','bg-green-50','text-green-800',20,0,1],
                ['Tentative','tentative','bg-yellow-50','text-yellow-800',30,0,1],
                ['Absent','absent','bg-gray-50','text-gray-800',40,1,1]
            ]
            const tx = this.db.transaction(()=>{ defaults.forEach(d => seed.run(...d)) })
            tx()
        } catch (e) {
            console.warn('participation_statuses migration skipped:', e)
        }
    }

    // Drop legacy CHECK constraint on events/event_templates participation_status by table rebuild if needed
    migrateDropStatusChecks() {
        try {
            const rowEvents = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='events'").get()
            const sqlEvents = rowEvents?.sql || ''
            if (sqlEvents.includes('CHECK(participation_status')) {
                this.db.exec('PRAGMA foreign_keys=OFF;')
                this.db.exec(`
                    BEGIN TRANSACTION;
                    CREATE TABLE events_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        description TEXT,
                        event_type TEXT NOT NULL,
                        server_name TEXT,
                        event_time TIMESTAMP NOT NULL,
                        timezone TEXT NOT NULL,
                        character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
                        participation_status TEXT DEFAULT 'Signed Up',
                        location TEXT,
                        recurring_pattern TEXT,
                        notification_enabled BOOLEAN DEFAULT 1,
                        notification_minutes INTEGER DEFAULT 30,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    INSERT INTO events_new SELECT id,name,description,event_type,server_name,event_time,timezone,character_id,participation_status,location,recurring_pattern,notification_enabled,notification_minutes,created_at FROM events;
                    DROP TABLE events;
                    ALTER TABLE events_new RENAME TO events;
                    COMMIT;
                `)
                this.db.exec('PRAGMA foreign_keys=ON;')
            }

            const rowTpl = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='event_templates'").get()
            const sqlTpl = rowTpl?.sql || ''
            if (sqlTpl.includes('CHECK(participation_status')) {
                this.db.exec('PRAGMA foreign_keys=OFF;')
                this.db.exec(`
                    BEGIN TRANSACTION;
                    CREATE TABLE event_templates_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL UNIQUE,
                        event_type TEXT,
                        description TEXT,
                        location TEXT,
                        participation_status TEXT DEFAULT 'Signed Up',
                        notification_enabled BOOLEAN DEFAULT 1,
                        notification_minutes INTEGER DEFAULT 30,
                        time_strategy TEXT CHECK(time_strategy IN ('relative','fixed')) DEFAULT NULL,
                        time_params TEXT,
                        payload_json TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    INSERT INTO event_templates_new SELECT id,name,event_type,description,location,participation_status,notification_enabled,notification_minutes,time_strategy,time_params,payload_json,created_at,updated_at FROM event_templates;
                    DROP TABLE event_templates;
                    ALTER TABLE event_templates_new RENAME TO event_templates;
                    COMMIT;
                `)
                this.db.exec('PRAGMA foreign_keys=ON;')
            }
        } catch (e) {
            try { this.db.exec('PRAGMA foreign_keys=ON;') } catch(_) {}
            console.warn('Drop status CHECK migration skipped:', e)
        }
    }

    migrateEventTemplatesAddPayload() {
        try {
            const cols = this.db.prepare("PRAGMA table_info('event_templates')").all()
            const hasPayload = cols.some(c => c.name === 'payload_json')
            if (!hasPayload) {
                this.db.exec("ALTER TABLE event_templates ADD COLUMN payload_json TEXT")
            }
        } catch (e) {
            console.warn('Event templates payload migration skipped:', e)
        }
    }

    migrateEventTemplatesPruneLegacy() {
        try {
            const cols = this.db.prepare("PRAGMA table_info('event_templates')").all()
            const hasPreferred = cols.some(c => c.name === 'preferred_time_mode')
            const hasTimezoneSource = cols.some(c => c.name === 'timezone_source')
            const hasTemplateServer = cols.some(c => c.name === 'template_server_name' || c.name === 'template_server_timezone')
            const hasLegacyStrategies = (() => {
                const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='event_templates'").get()
                const createSql = row?.sql || ''
                return createSql.includes('relativeOffset') || createSql.includes('nextDayAtTime') || createSql.includes('nextWeekdayAtTime') || createSql.includes('fixedDateTime')
            })()
            if (!hasPreferred && !hasTimezoneSource && !hasTemplateServer && !hasLegacyStrategies) return

            const all = this.db.prepare('SELECT * FROM event_templates').all()

            this.db.exec('PRAGMA foreign_keys=OFF;')
            this.db.exec(`
                BEGIN TRANSACTION;
                CREATE TABLE event_templates_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    event_type TEXT,
                    description TEXT,
                    location TEXT,
                    participation_status TEXT CHECK(participation_status IN ('Signed Up','Confirmed','Absent','Tentative')) DEFAULT 'Signed Up',
                    notification_enabled BOOLEAN DEFAULT 1,
                    notification_minutes INTEGER DEFAULT 30,
                    time_strategy TEXT CHECK(time_strategy IN ('relative','fixed')) DEFAULT NULL,
                    time_params TEXT,
                    payload_json TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `)

            const insert = this.db.prepare(`
                INSERT INTO event_templates_new (
                    id, name, event_type, description, location, participation_status, notification_enabled, notification_minutes,
                    time_strategy, time_params, payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)

            for (const row of all) {
                let time_strategy = row.time_strategy || null
                let time_params = row.time_params
                try { if (time_params && typeof time_params !== 'string') time_params = JSON.stringify(time_params) } catch {}
                let payload_json = row.payload_json
                try { if (payload_json && typeof payload_json !== 'string') payload_json = JSON.stringify(payload_json) } catch {}

                // Normalize legacy strategies → new model
                if (time_strategy === 'relativeOffset') {
                    // derive unit from offsetMinutes when possible
                    let unit = 'hour'
                    try {
                        const p = time_params ? JSON.parse(time_params) : {}
                        const mins = parseInt(p.offsetMinutes || 60)
                        if (mins % (7*24*60) === 0) unit = 'week'
                        else if (mins % (24*60) === 0) unit = 'day'
                        else unit = 'hour'
                        time_params = JSON.stringify({ unit })
                    } catch { time_params = JSON.stringify({ unit: 'hour' }) }
                    time_strategy = 'relative'
                } else if (time_strategy === 'nextDayAtTime') {
                    try {
                        const p = time_params ? JSON.parse(time_params) : {}
                        const timeOfDay = p.timeOfDay || '20:00'
                        time_params = JSON.stringify({ when: 'tomorrow', timeOfDay })
                    } catch { time_params = JSON.stringify({ when: 'tomorrow', timeOfDay: '20:00' }) }
                    time_strategy = 'fixed'
                } else if (time_strategy === 'nextWeekdayAtTime') {
                    try {
                        const p = time_params ? JSON.parse(time_params) : {}
                        const weekday = typeof p.weekday === 'number' ? p.weekday : parseInt(p.weekday || 1)
                        const timeOfDay = p.timeOfDay || '20:00'
                        time_params = JSON.stringify({ when: 'weekday', weekday, timeOfDay })
                    } catch { time_params = JSON.stringify({ when: 'weekday', weekday: 1, timeOfDay: '20:00' }) }
                    time_strategy = 'fixed'
                } else if (time_strategy === 'fixedDateTime') {
                    // Move absolute datetime into payload_json.event_time and drop strategy
                    try {
                        const p = time_params ? JSON.parse(time_params) : {}
                        const iso = p.isoDateTime
                        const payload = payload_json ? JSON.parse(payload_json) : {}
                        if (iso) {
                            payload.event_time = iso
                            payload_json = JSON.stringify(payload)
                        }
                    } catch {}
                    time_strategy = null
                    time_params = null
                } else if (time_strategy && !['relative','fixed'].includes(time_strategy)) {
                    // Unknown legacy: drop strategy
                    time_strategy = null
                }

                insert.run(
                    row.id, row.name, row.event_type, row.description, row.location,
                    row.participation_status, row.notification_enabled, row.notification_minutes,
                    time_strategy, time_params, payload_json, row.created_at, row.updated_at
                )
            }

            this.db.exec(`
                DROP TABLE event_templates;
                ALTER TABLE event_templates_new RENAME TO event_templates;
                COMMIT;
            `)
            this.db.exec('PRAGMA foreign_keys=ON;')
        } catch (e) {
            try { this.db.exec('PRAGMA foreign_keys=ON;') } catch (_) {}
            console.warn('Event templates prune legacy migration skipped:', e)
        }
    }

    insertDefaultEventTemplates() {
        const defaults = [
            {
                name: 'War',
                event_type: 'War',
                participation_status: 'Signed Up',
                notification_enabled: 1,
                notification_minutes: 60,
                time_strategy: 'relative',
                time_params: JSON.stringify({ unit: 'hour' })
            }
        ]

        const checkStmt = this.db.prepare('SELECT id FROM event_templates WHERE name = ?')
        const insertStmt = this.db.prepare(`
            INSERT INTO event_templates (
                name, event_type, description, location,
                participation_status, notification_enabled, notification_minutes,
                time_strategy, time_params
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        defaults.forEach(t => {
            const existing = checkStmt.get(t.name)
            if (!existing) {
                insertStmt.run(
                    t.name, t.event_type || null, t.description || null, t.location || null,
                    t.participation_status || 'Signed Up', t.notification_enabled ? 1 : 0, typeof t.notification_minutes === 'number' ? t.notification_minutes : 30,
                    t.time_strategy || null, t.time_params || null
                )
            }
        })
    }

    migrateTasksTableForOneTime() {
        try {
            const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get()
            const createSql = row?.sql || ''
            if (!createSql.includes("'one-time'")) {
                console.log('Migrating tasks table to include one-time type...')
                // Temporarily disable foreign key checks for table rebuild
                this.db.exec('PRAGMA foreign_keys=OFF;')
                this.db.exec(`
                    BEGIN TRANSACTION;
                    CREATE TABLE tasks_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        description TEXT,
                        type TEXT CHECK(type IN ('daily', 'weekly', 'one-time')) NOT NULL,
                        priority TEXT CHECK(priority IN ('Low', 'Medium', 'High', 'Critical')) DEFAULT 'Medium',
                        rewards TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    INSERT INTO tasks_new (id, name, description, type, priority, rewards, created_at)
                        SELECT id, name, description, type, priority, rewards, created_at FROM tasks;
                    DROP TABLE tasks;
                    ALTER TABLE tasks_new RENAME TO tasks;
                    COMMIT;
                `)
                this.db.exec('PRAGMA foreign_keys=ON;')
                console.log('Tasks table migration complete.')
            }
        } catch (error) {
            console.error('Tasks table migration failed:', error)
            try { this.db.exec('PRAGMA foreign_keys=ON;') } catch (_) {}
        }
    }

    insertDefaultTasks() {
        const defaultTasks = [
            // Weekly
            { name: 'Mutated Dungeons', description: '', type: 'weekly', priority: 'Medium', rewards: null },
            { name: 'Hive of Gorgons', description: '', type: 'weekly', priority: 'Medium', rewards: null },
            { name: 'Trial of the Devourer (Sandworm)', description: '', type: 'weekly', priority: 'Medium', rewards: null },
            { name: 'FFA Goldcursed Coconut', description: '', type: 'weekly', priority: 'Medium', rewards: null },
            // Daily
            { name: 'Faction Bonus Missions', description: '', type: 'daily', priority: 'Medium', rewards: null },
            { name: 'Gypsum From Faction Vendor', description: '', type: 'daily', priority: 'Medium', rewards: null }
        ]

        const checkTask = this.db.prepare('SELECT id FROM tasks WHERE name = ?')
        const insertTask = this.db.prepare('INSERT INTO tasks (name, description, type, priority, rewards) VALUES (?, ?, ?, ?, ?)')

        defaultTasks.forEach(task => {
            const existing = checkTask.get(task.name)
            if (!existing) {
                insertTask.run(task.name, task.description, task.type, task.priority, task.rewards)
            }
        })
    }

    // Ensure database is initialized
    async ensureInitialized() {
        if (!this.initialized) {
            await this.init()
        }
    }

    // Generic query methods
    async prepare(sql) {
        await this.ensureInitialized()
        return this.db.prepare(sql)
    }

    async exec(sql) {
        await this.ensureInitialized()
        return this.db.exec(sql)
    }

    async transaction(fn) {
        await this.ensureInitialized()
        return this.db.transaction(fn)
    }

    close() {
        if (this.db) {
            this.db.close()
        }
    }

    // Delete all data from the database
    async deleteAllData() {
        await this.ensureInitialized()
        
        const deleteTaskCompletions = this.db.prepare('DELETE FROM task_completions')
        const deleteTaskAssignments = this.db.prepare('DELETE FROM task_assignments')
        const deleteEvents = this.db.prepare('DELETE FROM events')
        const deleteTasks = this.db.prepare('DELETE FROM tasks')
        const deleteCharacters = this.db.prepare('DELETE FROM characters')
        const deleteServers = this.db.prepare('DELETE FROM servers')
        
        const tx = this.db.transaction(() => {
            deleteTaskCompletions.run()
            deleteTaskAssignments.run()
            deleteEvents.run()
            deleteTasks.run()
            deleteCharacters.run()
            deleteServers.run()
        })
        
        tx()
        
        console.log('All data deleted from database')
        return true
    }

    // Export all data from the database
    async exportData() {
        await this.ensureInitialized()
        
        const data = {
            characters: this.db.prepare('SELECT * FROM characters').all(),
            tasks: this.db.prepare('SELECT * FROM tasks').all(),
            events: this.db.prepare('SELECT * FROM events').all(),
            task_assignments: this.db.prepare('SELECT * FROM task_assignments').all(),
            task_completions: this.db.prepare('SELECT * FROM task_completions').all(),
            servers: this.db.prepare('SELECT * FROM servers').all(),
            exportedAt: new Date().toISOString(),
            version: '1.0.0'
        }
        
        return data
    }
}

// Export singleton instance
const database = new DatabaseService()
export default database 