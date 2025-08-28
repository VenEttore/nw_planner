import database from './database.js'

class EventService {
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
            insertEvent: await this.db.prepare(`
                INSERT INTO events (name, description, event_type, server_name, event_time, timezone, character_id, participation_status, location, recurring_pattern, notification_enabled, notification_minutes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),
            updateEvent: await this.db.prepare(`
                UPDATE events 
                SET name = ?, description = ?, event_type = ?, server_name = ?, event_time = ?, timezone = ?, character_id = ?, participation_status = ?, location = ?, recurring_pattern = ?, notification_enabled = ?, notification_minutes = ?
                WHERE id = ?
            `),
            deleteEvent: await this.db.prepare('DELETE FROM events WHERE id = ?'),
            getEventById: await this.db.prepare('SELECT * FROM events WHERE id = ?'),
            getAllEvents: await this.db.prepare('SELECT * FROM events ORDER BY event_time ASC'),
            getEventsByCharacter: await this.db.prepare('SELECT * FROM events WHERE character_id = ? ORDER BY event_time ASC'),
            getEventsByServer: await this.db.prepare('SELECT * FROM events WHERE server_name = ? ORDER BY event_time ASC'),
            getEventsByDateRange: await this.db.prepare(`
                SELECT * FROM events 
                WHERE datetime(event_time) >= datetime(?) 
                AND datetime(event_time) <= datetime(?)
                ORDER BY event_time ASC
            `),
            getUpcomingEvents: await this.db.prepare(`
                SELECT * FROM events 
                WHERE datetime(event_time) > datetime('now') 
                ORDER BY event_time ASC 
                LIMIT ?
            `),
            getEventsByType: await this.db.prepare('SELECT * FROM events WHERE event_type = ? ORDER BY event_time ASC'),
            updateParticipationStatus: await this.db.prepare('UPDATE events SET participation_status = ? WHERE id = ?'),
            getEventsRequiringNotification: await this.db.prepare(`
                SELECT * FROM events 
                WHERE notification_enabled = 1 
                AND datetime(event_time, '-' || notification_minutes || ' minutes') <= datetime('now')
                AND datetime(event_time) > datetime('now')
            `),
            
            // Calendar and scheduling queries
            getEventsForCalendar: await this.db.prepare(`
                SELECT 
                    e.*,
                    c.name as character_name,
                    c.faction
                FROM events e
                LEFT JOIN characters c ON e.character_id = c.id
                WHERE datetime(event_time) >= datetime(?)
                AND datetime(event_time) <= datetime(?)
                ORDER BY event_time ASC
            `),
            
            // Conflict detection
            getConflictingEvents: await this.db.prepare(`
                SELECT * FROM events 
                WHERE character_id = ? 
                AND datetime(event_time) BETWEEN datetime(?, '-1 hour') AND datetime(?, '+1 hour')
                AND id != ?
            `),
            
            // Statistics
            getEventStats: await this.db.prepare(`
                SELECT 
                    COUNT(*) as total_events,
                    COUNT(CASE WHEN event_type = 'War' THEN 1 END) as wars,
                    COUNT(CASE WHEN event_type = 'Invasion' THEN 1 END) as invasions,
                    COUNT(CASE WHEN event_type = 'Company Event' THEN 1 END) as company_events,
                    COUNT(CASE WHEN participation_status = 'Confirmed' THEN 1 END) as confirmed,
                    COUNT(CASE WHEN participation_status = 'Signed Up' THEN 1 END) as signed_up
                FROM events
                WHERE datetime(event_time) > datetime('now')
            `)
        }
        
        this.statementsInitialized = true
    }

    async ensureInitialized() {
        await this.db.ensureInitialized()
        await this.initStatements()
    }

    // Event CRUD operations
    async createEvent(eventData) {
        await this.ensureInitialized()
        
        const {
            name,
            description,
            event_type,
            server_name,
            event_time,
            timezone,
            character_id,
            participation_status,
            location,
            recurring_pattern,
            notification_enabled,
            notification_minutes
        } = eventData
        
        const result = this.statements.insertEvent.run(
            name,
            description || null,
            event_type,
            server_name || null,
            event_time,
            timezone || 'UTC',
            character_id || null,
            participation_status || 'Signed Up',
            location || null,
            recurring_pattern || null,
            (notification_enabled !== undefined ? (notification_enabled ? 1 : 0) : 1),
            (typeof notification_minutes === 'number' ? notification_minutes : 30)
        )
        
        if (result.changes > 0) {
            return await this.getEventById(result.lastInsertRowid)
        }
        
        return null
    }

    async updateEvent(id, eventData) {
        await this.ensureInitialized()
        
        const {
            name,
            description,
            event_type,
            server_name,
            event_time,
            timezone,
            character_id,
            participation_status,
            location,
            recurring_pattern,
            notification_enabled,
            notification_minutes
        } = eventData
        
        const result = this.statements.updateEvent.run(
            name,
            description || null,
            event_type,
            server_name || null,
            event_time,
            timezone || 'UTC',
            character_id || null,
            participation_status || 'Signed Up',
            location || null,
            recurring_pattern || null,
            (notification_enabled !== undefined ? (notification_enabled ? 1 : 0) : 1),
            (typeof notification_minutes === 'number' ? notification_minutes : 30),
            id
        )
        
        if (result.changes > 0) {
            return await this.getEventById(id)
        }
        
        return null
    }

    async deleteEvent(id) {
        await this.ensureInitialized()
        
        const result = this.statements.deleteEvent.run(id)
        return result.changes > 0
    }

    async getEventById(id) {
        await this.ensureInitialized()
        
        return this.statements.getEventById.get(id) || null
    }

    async getAllEvents() {
        await this.ensureInitialized()
        
        return this.statements.getAllEvents.all()
    }

    async getEventsByCharacter(characterId) {
        await this.ensureInitialized()
        
        return this.statements.getEventsByCharacter.all(characterId)
    }

    async getEventsByServer(serverName) {
        await this.ensureInitialized()
        
        return this.statements.getEventsByServer.all(serverName)
    }

    async getEventsByDateRange(startDate, endDate) {
        await this.ensureInitialized()
        
        return this.statements.getEventsByDateRange.all(startDate, endDate)
    }

    async getUpcomingEvents(limit = 10) {
        await this.ensureInitialized()
        
        return this.statements.getUpcomingEvents.all(limit)
    }

    async getEventsByType(eventType) {
        await this.ensureInitialized()
        
        return this.statements.getEventsByType.all(eventType)
    }

    // RSVP Management
    async updateParticipationStatus(eventId, status) {
        await this.ensureInitialized()
        
        const safe = (status ?? '').toString()
        const result = this.statements.updateParticipationStatus.run(safe, eventId)
        return result.changes > 0
    }

    // Calendar integration
    async getEventsForCalendar(startDate, endDate) {
        await this.ensureInitialized()
        
        return this.statements.getEventsForCalendar.all(startDate, endDate)
    }

    // Conflict detection
    async getConflictingEvents(characterId, eventTime, excludeEventId = null) {
        await this.ensureInitialized()
        
        return this.statements.getConflictingEvents.all(
            characterId, 
            eventTime, 
            eventTime, 
            excludeEventId || -1
        )
    }

    // Notifications
    async getEventsRequiringNotification() {
        await this.ensureInitialized()
        
        return this.statements.getEventsRequiringNotification.all()
    }

    // Statistics
    async getEventStats() {
        await this.ensureInitialized()
        
        return this.statements.getEventStats.get()
    }

    // Helper methods for common New World events
    async createWarEvent(eventData) {
        return await this.createEvent({
            ...eventData,
            event_type: 'War',
            notification_enabled: true,
            notification_minutes: 60 // 1 hour notice for wars
        })
    }

    async createInvasionEvent(eventData) {
        return await this.createEvent({
            ...eventData,
            event_type: 'Invasion',
            notification_enabled: true,
            notification_minutes: 30 // 30 minute notice for invasions
        })
    }

    async createCompanyEvent(eventData) {
        return await this.createEvent({
            ...eventData,
            event_type: 'Company Event',
            notification_enabled: true,
            notification_minutes: 15 // 15 minute notice for company events
        })
    }

    async createCustomEvent(eventData) {
        return await this.createEvent({
            ...eventData,
            event_type: 'Custom',
            notification_enabled: eventData.notification_enabled !== undefined ? eventData.notification_enabled : false,
            notification_minutes: eventData.notification_minutes || 30
        })
    }

    // Get events for specific character with conflict checking
    async getCharacterEventsWithConflicts(characterId) {
        await this.ensureInitialized()
        
        const events = await this.getEventsByCharacter(characterId)
        
        // Check for conflicts for each event
        const eventsWithConflicts = await Promise.all(
            events.map(async (event) => {
                const conflicts = await this.getConflictingEvents(
                    characterId, 
                    event.event_time, 
                    event.id
                )
                
                return {
                    ...event,
                    hasConflicts: conflicts.length > 0,
                    conflicts: conflicts
                }
            })
        )
        
        return eventsWithConflicts
    }

    // Format events for FullCalendar
    formatEventsForCalendar(events) {
        return events.map(event => ({
            id: event.id.toString(),
            title: event.name,
            start: event.event_time,
            end: event.event_time, // Most events are point-in-time
            backgroundColor: this.getEventColor(event.event_type, event.participation_status),
            borderColor: this.getEventBorderColor(event.event_type),
            textColor: '#ffffff',
            extendedProps: {
                description: event.description,
                eventType: event.event_type,
                serverName: event.server_name,
                participationStatus: event.participation_status,
                location: event.location,
                characterName: event.character_name,
                faction: event.faction
            }
        }))
    }

    // Get color for event based on type and status
    getEventColor(eventType, participationStatus) {
        const baseColors = {
            'War': '#dc2626',           // red-600
            'Invasion': '#ea580c',      // orange-600
            'Company Event': '#2563eb', // blue-600
            'Custom': '#7c3aed',        // violet-600
            'Meeting': '#059669',       // emerald-600
            'PvP': '#b45309',          // amber-700
            'PvE': '#4f46e5'           // indigo-600
        }
        
        let color = baseColors[eventType] || '#6b7280' // gray-500 as fallback
        
        // Adjust opacity based on participation status
        switch (participationStatus) {
            case 'Confirmed':
                return color
            case 'Signed Up':
                return color + 'CC' // 80% opacity
            case 'Tentative':
                return color + '99' // 60% opacity
            case 'Absent':
                return color + '66' // 40% opacity
            default:
                return color
        }
    }

    getEventBorderColor(eventType) {
        const borderColors = {
            'War': '#991b1b',           // red-800
            'Invasion': '#c2410c',      // orange-700
            'Company Event': '#1d4ed8', // blue-700
            'Custom': '#6d28d9',        // violet-700
            'Meeting': '#047857',       // emerald-700
            'PvP': '#92400e',          // amber-800
            'PvE': '#3730a3'           // indigo-800
        }
        
        return borderColors[eventType] || '#4b5563' // gray-600 as fallback
    }

    // Clean up old events (optional maintenance)
    async cleanupOldEvents(daysOld = 30) {
        await this.ensureInitialized()
        
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - daysOld)
        
        const stmt = this.db.prepare(`
            DELETE FROM events 
            WHERE datetime(event_time) < datetime(?)
        `)
        
        const result = stmt.run(cutoffDate.toISOString())
        return result.changes
    }
}

// Export a singleton instance
export default new EventService() 