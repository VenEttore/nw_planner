// API service for communicating with the main process
// This provides a clean interface between the renderer and main process

class ApiService {
    constructor() {
        this.electronAPI = null
        this.isElectron = false
        this.initialized = false
    }

    async init() {
        if (this.initialized) return
        
        // Check if we're running in Electron
        console.log('API Service - INIT CALLED at:', new Date().toISOString())
        console.log('API Service - checking for Electron mode...')
        console.log('window exists:', typeof window !== 'undefined')
        console.log('window.electronAPI exists:', typeof window !== 'undefined' && !!window.electronAPI)
        
        // If electronAPI is not available, wait a bit and try again (preload script might still be loading)
        if (typeof window !== 'undefined' && !window.electronAPI) {
            console.log('API Service - electronAPI not found, waiting 100ms and retrying...')
            await new Promise(resolve => setTimeout(resolve, 100))
            console.log('window.electronAPI exists after wait:', !!window.electronAPI)
            
            // Try waiting longer if still not available
            if (!window.electronAPI) {
                console.log('API Service - electronAPI still not found, waiting 500ms more...')
                await new Promise(resolve => setTimeout(resolve, 500))
                console.log('window.electronAPI exists after longer wait:', !!window.electronAPI)
            }
        }
        
        if (typeof window !== 'undefined' && window.electronAPI) {
            this.electronAPI = window.electronAPI
            this.isElectron = true
            console.log('API Service - Running in Electron mode')
            console.log('API Service - electronAPI.servers available:', !!this.electronAPI.servers)
        } else {
            // Fallback for web mode - use mock data or local storage
            this.isElectron = false
            console.warn('API Service - Running in web mode - using mock data')
            if (typeof window !== 'undefined') {
                console.log('Available window properties:', Object.keys(window).filter(key => key.includes('electron') || key.includes('API')))
            }
        }
        
        this.initialized = true
        console.log('API Service - INIT COMPLETE, isElectron:', this.isElectron)
        
        // Check database status
        if (this.isElectron) {
            try {
                const dbReady = await this.isDatabaseReady()
                console.log('Database initialization status:', dbReady ? 'SUCCESS ✅' : 'FAILED ❌')
            } catch (error) {
                console.error('Database status check failed:', error)
            }
        }
    }

    // Character operations
    async getCharacters() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.characters.getAll()
        } else {
            // Web mode fallback
            return this.getMockCharacters()
        }
    }

    async getActiveCharacters() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.characters.getActive()
        } else {
            return this.getMockCharacters().filter(c => c.active_status)
        }
    }

    async createCharacter(characterData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.characters.create(characterData)
        } else {
            // Web mode fallback - simulate creation
            const mockCharacter = {
                id: Date.now(),
                ...characterData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
            
            // Store in localStorage for web mode
            const existing = JSON.parse(localStorage.getItem('nw_characters') || '[]')
            existing.push(mockCharacter)
            localStorage.setItem('nw_characters', JSON.stringify(existing))
            
            return mockCharacter
        }
    }

    async updateCharacter(id, characterData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.characters.update(id, characterData)
        } else {
            // Web mode fallback
            const existing = JSON.parse(localStorage.getItem('nw_characters') || '[]')
            const index = existing.findIndex(c => c.id === id)
            if (index !== -1) {
                existing[index] = { ...existing[index], ...characterData, updated_at: new Date().toISOString() }
                localStorage.setItem('nw_characters', JSON.stringify(existing))
                return existing[index]
            }
            return null
        }
    }

    async deleteCharacter(id) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.characters.delete(id)
        } else {
            // Web mode fallback
            const existing = JSON.parse(localStorage.getItem('nw_characters') || '[]')
            const filtered = existing.filter(c => c.id !== id)
            localStorage.setItem('nw_characters', JSON.stringify(filtered))
            return true
        }
    }

    async getCharacterById(id) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.characters.getById(id)
        } else {
            const existing = JSON.parse(localStorage.getItem('nw_characters') || '[]')
            return existing.find(c => c.id === id) || null
        }
    }

    async updateCharacterActiveStatus(id, activeStatus) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.characters.updateActiveStatus(id, activeStatus)
        } else {
            return await this.updateCharacter(id, { active_status: activeStatus })
        }
    }

    async getServerList() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.getServerNameList()
        } else {
            // Get unique servers from existing characters
            const characters = this.getMockCharacters()
            const servers = [...new Set(characters.map(c => c.server_name))].filter(Boolean)
            return servers
        }
    }

    // Server operations
    async getServers() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.getAll()
        } else {
            // Web mode fallback - return mock servers
            return this.getMockServers()
        }
    }

    async getActiveServers() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.getActive()
        } else {
            return this.getMockServers().filter(s => s.active_status)
        }
    }

    async createServer(serverData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.create(serverData)
        } else {
            // Web mode fallback
            console.warn('Server creation not supported in web mode')
            throw new Error('Server creation not supported in web mode')
        }
    }

    async updateServer(id, serverData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.update(id, serverData)
        } else {
            console.warn('Server update not supported in web mode')
            throw new Error('Server update not supported in web mode')
        }
    }

    async deleteServer(id) {
        await this.init()
        
        console.log('=== DELETE SERVER DEBUG ===')
        console.log('API Service initialized:', this.initialized)
        console.log('Is Electron mode:', this.isElectron)
        console.log('ElectronAPI available:', !!this.electronAPI)
        console.log('ElectronAPI.servers available:', !!this.electronAPI?.servers)
        console.log('ElectronAPI.servers.delete available:', !!this.electronAPI?.servers?.delete)
        console.log('Window.electronAPI available:', !!window.electronAPI)
        console.log('Window.electronAPI.servers available:', !!window.electronAPI?.servers)
        
        if (this.isElectron) {
            console.log('Attempting to delete server via Electron API...')
            return await this.electronAPI.servers.delete(id)
        } else {
            console.warn('Server deletion not supported in web mode')
            throw new Error('Server deletion not supported in web mode')
        }
    }

    async getServerById(id) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.getById(id)
        } else {
            return this.getMockServers().find(s => s.id === id)
        }
    }

    async updateServerActiveStatus(id, activeStatus) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.updateActiveStatus(id, activeStatus)
        } else {
            console.warn('Server status update not supported in web mode')
            throw new Error('Server status update not supported in web mode')
        }
    }

    async getServersByRegion(region) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.getByRegion(region)
        } else {
            return this.getMockServers().filter(s => s.region === region)
        }
    }

    async getServerStatistics() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.getStatistics()
        } else {
            const servers = this.getMockServers()
            return {
                total: servers.length,
                active: servers.filter(s => s.active_status).length,
                inactive: servers.filter(s => !s.active_status).length
            }
        }
    }

    async getRegionList() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.getRegionList()
        } else {
            const servers = this.getMockServers()
            return [...new Set(servers.map(s => s.region))]
        }
    }

    async getServerTimezone(serverName) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.getServerTimezone(serverName)
        } else {
            const server = this.getMockServers().find(s => s.name === serverName)
            return server ? server.timezone : null
        }
    }

    async initializeDefaultServers() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.servers.initializeDefaultServers()
        } else {
            console.warn('Server initialization not supported in web mode')
            return false
        }
    }

    // Import/append servers
    async importServersFromFile(filePath) {
        await this.init()
        if (!this.isElectron) throw new Error('Import requires Electron mode')
        return await this.electronAPI.servers.importFromFile(filePath)
    }

    async clearUnusedServers() {
        await this.init()
        if (!this.isElectron) throw new Error('Clear requires Electron mode')
        return await this.electronAPI.servers.clearUnused()
    }

    async retrieveLatestServers() {
        await this.init()
        if (!this.isElectron) throw new Error('Retrieve requires Electron mode')
        return await this.electronAPI.servers.retrieveLatest()
    }

    async getCharacterStatistics() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.characters.getStatistics()
        } else {
            const characters = await this.getCharacters()
            return {
                total: characters.length,
                active: characters.filter(c => c.active_status).length,
                byFaction: {
                    Factionless: characters.filter(c => c.faction === 'Factionless').length,
                    Marauders: characters.filter(c => c.faction === 'Marauders').length,
                    Covenant: characters.filter(c => c.faction === 'Covenant').length,
                    Syndicate: characters.filter(c => c.faction === 'Syndicate').length
                }
            }
        }
    }

    async getAllCharactersWithServerTime() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.characters.getAllWithServerTime()
        } else {
            return this.getMockCharacters()
        }
    }

    // Task operations
    async getTasks() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.getAll()
        } else {
            return this.getMockTasks()
        }
    }

    async initializeDefaultTasks() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.initializeDefaults()
        } else {
            // Seed defaults in web mode localStorage
            if (this.getMockTasks().length > 0) return true
            const defaults = [
                { name: 'Daily Faction Missions', description: 'Complete 3 faction missions', type: 'daily', priority: 'High', rewards: 'Faction Tokens, Gold' },
                { name: 'Territory Standing', description: 'Complete settlement board missions', type: 'daily', priority: 'Medium', rewards: 'Territory Standing' },
                { name: 'Gypsum Orb Crafting', description: 'Craft daily gypsum orbs', type: 'daily', priority: 'Critical', rewards: 'Expertise Bumps' },
                { name: 'Weekly Faction Missions', description: 'Complete weekly faction mission', type: 'weekly', priority: 'High', rewards: 'Faction Tokens, Gold' }
            ]
            const withIds = defaults.map((t, idx) => ({ id: Date.now() + idx, ...t }))
            localStorage.setItem('nw_tasks', JSON.stringify(withIds))
            return true
        }
    }

    async getTasksByType(type) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.getByType(type)
        } else {
            return this.getMockTasks().filter(t => t.type === type)
        }
    }

    async createTask(taskData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.create(taskData)
        } else {
            const mockTask = {
                id: Date.now(),
                ...taskData,
                created_at: new Date().toISOString()
            }
            
            const existing = JSON.parse(localStorage.getItem('nw_tasks') || '[]')
            existing.push(mockTask)
            localStorage.setItem('nw_tasks', JSON.stringify(existing))
            
            return mockTask
        }
    }

    async updateTask(id, taskData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.update(id, taskData)
        } else {
            const existing = JSON.parse(localStorage.getItem('nw_tasks') || '[]')
            const index = existing.findIndex(t => t.id === id)
            if (index !== -1) {
                existing[index] = { ...existing[index], ...taskData }
                localStorage.setItem('nw_tasks', JSON.stringify(existing))
                return existing[index]
            }
            return null
        }
    }

    async deleteTask(id) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.delete(id)
        } else {
            const existing = JSON.parse(localStorage.getItem('nw_tasks') || '[]')
            const filtered = existing.filter(t => t.id !== id)
            localStorage.setItem('nw_tasks', JSON.stringify(filtered))
            return true
        }
    }

    async getCharacterTasks(characterId) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.getCharacterTasks(characterId)
        } else {
            // In web mode, return all tasks as assigned with completion status
            const tasks = this.getMockTasks()
            const today = new Date().toISOString().split('T')[0]
            
            return tasks.map(task => {
                const resetPeriod = task.type === 'weekly' ? this.getWeeklyResetPeriod() : today
                const completionKey = `task_completion_${task.id}_${characterId}_${resetPeriod}`
                const completed = localStorage.getItem(completionKey) === 'true'
                
                return {
                    ...task,
                    completed,
                    resetPeriod
                }
            })
        }
    }

    // Assignment helpers
    async assignTaskToCharacter(taskId, characterId) {
        await this.init()
        if (this.isElectron) return await this.electronAPI.tasks.assignToCharacter(taskId, characterId)
        return true
    }

    async removeTaskAssignment(taskId, characterId) {
        await this.init()
        if (this.isElectron) return await this.electronAPI.tasks.removeAssignment(taskId, characterId)
        return true
    }

    async assignTaskToCharacters(taskId, characterIds) {
        await this.init()
        if (this.isElectron) return await this.electronAPI.tasks.assignToCharacters(taskId, characterIds)
        return true
    }

    async assignTasksToCharacter(taskIds, characterId) {
        await this.init()
        if (this.isElectron) return await this.electronAPI.tasks.assignTasksToCharacter(taskIds, characterId)
        return true
    }

    async setTaskAssignments(taskId, characterIds) {
        await this.init()
        if (this.isElectron) return await this.electronAPI.tasks.setTaskAssignments(taskId, characterIds)
        return true
    }

    async getAssignedCharactersForTask(taskId) {
        await this.init()
        if (this.isElectron) return await this.electronAPI.tasks.getAssignedCharactersForTask(taskId)
        return []
    }

    async markTaskComplete(taskId, characterId, resetPeriod) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.markComplete(taskId, characterId, resetPeriod)
        } else {
            // Web mode - store in localStorage
            const completionKey = `task_completion_${taskId}_${characterId}_${resetPeriod}`
            localStorage.setItem(completionKey, 'true')
            return true
        }
    }

    async markTaskIncomplete(taskId, characterId, resetPeriod) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.markIncomplete(taskId, characterId, resetPeriod)
        } else {
            // Web mode - remove from localStorage
            const completionKey = `task_completion_${taskId}_${characterId}_${resetPeriod}`
            localStorage.removeItem(completionKey)
            return true
        }
    }

    async getTaskStats() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.tasks.getStats()
        } else {
            const tasks = this.getMockTasks()
            return {
                total_tasks: tasks.length,
                daily_tasks: tasks.filter(t => t.type === 'daily').length,
                weekly_tasks: tasks.filter(t => t.type === 'weekly').length,
                critical_tasks: tasks.filter(t => t.priority === 'Critical').length,
                high_tasks: tasks.filter(t => t.priority === 'High').length
            }
        }
    }

    async manualResetTasks(type) {
        await this.init()
        if (this.isElectron) {
            return await this.electronAPI.tasks.manualReset(type)
        } else {
            // Web mode: simulate by clearing completion keys for current period
            const characters = this.getMockCharacters()
            const tasks = this.getMockTasks().filter(t => t.type === type)
            for (const c of characters) {
                const period = type === 'weekly' ? this.getWeeklyResetPeriod() : new Date().toISOString().split('T')[0]
                for (const t of tasks) {
                    const key = `task_completion_${t.id}_${c.id}_${period}`
                    localStorage.removeItem(key)
                }
            }
            return true
        }
    }

    // Database operations
    async isDatabaseReady() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.database.isReady()
        } else {
            return true // Always ready in web mode
        }
    }

    // Web mode data management
    getMockCharacters() {
        // Get from localStorage only - no default mock data
        const stored = localStorage.getItem('nw_characters')
        return stored ? JSON.parse(stored) : []
    }

    getMockTasks() {
        // Get from localStorage only - no default mock data
        const stored = localStorage.getItem('nw_tasks')
        return stored ? JSON.parse(stored) : []
    }

    getMockServers() {
        // Get from localStorage only - provide basic fallback servers
        const stored = localStorage.getItem('nw_servers')
        if (stored) {
            return JSON.parse(stored)
        }
        
        // Basic fallback servers for web mode
        return [
            { id: 1, name: 'Valhalla', region: 'US East', timezone: 'America/New_York', active_status: true },
            { id: 2, name: 'Camelot', region: 'US West', timezone: 'America/Los_Angeles', active_status: true },
            { id: 3, name: 'Hellheim', region: 'EU Central', timezone: 'Europe/Berlin', active_status: true },
            { id: 4, name: 'Asgard', region: 'EU Central', timezone: 'Europe/Berlin', active_status: true },
            { id: 5, name: 'Utopia', region: 'AP Southeast', timezone: 'Australia/Sydney', active_status: true }
        ]
    }

    getWeeklyResetPeriod() {
        const now = new Date()
        const year = now.getFullYear()
        const weekNumber = this.getWeekNumber(now)
        return `${year}-W${weekNumber.toString().padStart(2, '0')}`
    }

    getWeekNumber(date) {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
    }

    // Reset timer operations
    async getResetTimers(serverNames) {
        await this.init()
        
        if (this.isElectron) {
            // In Electron mode, use IPC if available
            if (this.electronAPI.resetTimers) {
                return await this.electronAPI.resetTimers.getMultiServer(serverNames)
            }
        }
        
        // Fallback to importing the service directly (web mode or fallback)
        try {
            const { default: resetTimerService } = await import('./resetTimerService.js')
            return resetTimerService.getMultiServerResetInfo(serverNames)
        } catch (error) {
            console.error('Error loading reset timer service:', error)
            return serverNames.map(server => ({
                server,
                daily: { hours: 0, minutes: 0, seconds: 0, formatted: '00:00:00' },
                weekly: { hours: 0, minutes: 0, seconds: 0, formatted: '00:00:00' },
                serverTime: { time: '00:00:00', date: 'Unknown' },
                error: 'Service unavailable'
            }))
        }
    }

    // New: get reset timers when full server objects are available
    async getResetTimersForServers(servers) {
        await this.init()
        try {
            const { default: resetTimerService } = await import('./resetTimerService.js')
            return resetTimerService.getMultiServerResetInfo(servers)
        } catch (error) {
            console.error('Error loading reset timer service:', error)
            return servers.map(s => ({
                server: s.name,
                daily: { hours: 0, minutes: 0, seconds: 0, formatted: '00:00:00' },
                weekly: { hours: 0, minutes: 0, seconds: 0, formatted: '00:00:00' },
                serverTime: { time: '00:00:00', date: 'Unknown' },
                error: 'Service unavailable'
            }))
        }
    }

    async startResetTimer(serverName, callback) {
        await this.init()
        
        if (this.isElectron && this.electronAPI.resetTimers) {
            return await this.electronAPI.resetTimers.start(serverName, callback)
        }
        
        // Fallback to direct service usage
        try {
            const { default: resetTimerService } = await import('./resetTimerService.js')
            return resetTimerService.startResetTimer(serverName, callback)
        } catch (error) {
            console.error('Error starting reset timer:', error)
            return null
        }
    }

    // New: start timer with full server object (timezone-first)
    async startResetTimerForServer(server, callback) {
        await this.init()
        try {
            const { default: resetTimerService } = await import('./resetTimerService.js')
            return resetTimerService.startResetTimerForServer(server, callback)
        } catch (error) {
            console.error('Error starting reset timer (server object):', error)
            return null
        }
    }

    async stopResetTimer(timerId) {
        await this.init()
        
        if (this.isElectron && this.electronAPI.resetTimers) {
            return await this.electronAPI.resetTimers.stop(timerId)
        }
        
        // Fallback to direct service usage
        try {
            const { default: resetTimerService } = await import('./resetTimerService.js')
            resetTimerService.stopResetTimer(timerId)
            return true
        } catch (error) {
            console.error('Error stopping reset timer:', error)
            return false
        }
    }

    async getServerTime(serverName) {
        await this.init()
        
        try {
            const { default: resetTimerService } = await import('./resetTimerService.js')
            return resetTimerService.getServerTimeDisplay(serverName)
        } catch (error) {
            console.error('Error getting server time:', error)
            return { time: '00:00:00', date: 'Unknown', timezone: 'Unknown' }
        }
    }

    // Event operations
    async getEvents() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.getAll()
        } else {
            return this.getMockEvents()
        }
    }

    async getEventsByCharacter(characterId) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.getByCharacter(characterId)
        } else {
            return this.getMockEvents().filter(e => e.character_id === characterId)
        }
    }

    async getUpcomingEvents(limit = 10) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.getUpcoming(limit)
        } else {
            const now = new Date()
            return this.getMockEvents()
                .filter(e => new Date(e.event_time) > now)
                .slice(0, limit)
        }
    }

    async getEventsForCalendar(startDate, endDate) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.getForCalendar(startDate, endDate)
        } else {
            const start = new Date(startDate)
            const end = new Date(endDate)
            return this.getMockEvents()
                .filter(e => {
                    const eventTime = new Date(e.event_time)
                    return eventTime >= start && eventTime <= end
                })
                .map(e => ({
                    ...e,
                    character_name: this.getMockCharacters().find(c => c.id === e.character_id)?.name || 'Unknown'
                }))
        }
    }

    async createEvent(eventData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.create(eventData)
        } else {
            const mockEvent = {
                id: Date.now(),
                ...eventData,
                created_at: new Date().toISOString()
            }
            
            const existing = JSON.parse(localStorage.getItem('nw_events') || '[]')
            existing.push(mockEvent)
            localStorage.setItem('nw_events', JSON.stringify(existing))
            
            return mockEvent
        }
    }

    async updateEvent(id, eventData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.update(id, eventData)
        } else {
            const existing = JSON.parse(localStorage.getItem('nw_events') || '[]')
            const index = existing.findIndex(e => e.id === id)
            if (index !== -1) {
                existing[index] = { ...existing[index], ...eventData }
                localStorage.setItem('nw_events', JSON.stringify(existing))
                return existing[index]
            }
            return null
        }
    }

    async deleteEvent(id) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.delete(id)
        } else {
            const existing = JSON.parse(localStorage.getItem('nw_events') || '[]')
            const filtered = existing.filter(e => e.id !== id)
            localStorage.setItem('nw_events', JSON.stringify(filtered))
            return true
        }
    }

    async updateEventRsvp(eventId, status) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.updateRsvp(eventId, status)
        } else {
            return await this.updateEvent(eventId, { participation_status: status })
        }
    }

    async getEventById(id) {
        await this.init()
        if (this.isElectron) {
            return await this.electronAPI.events.getById(id)
        }
        const existing = JSON.parse(localStorage.getItem('nw_events') || '[]')
        return existing.find(e => e.id === id) || null
    }

    async getEventStats() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.getStats()
        } else {
            const events = this.getMockEvents()
            const now = new Date()
            const upcoming = events.filter(e => new Date(e.event_time) > now)
            
            return {
                total_events: upcoming.length,
                wars: upcoming.filter(e => e.event_type === 'War').length,
                invasions: upcoming.filter(e => e.event_type === 'Invasion').length,
                company_events: upcoming.filter(e => e.event_type === 'Company Event').length,
                confirmed: upcoming.filter(e => e.participation_status === 'Confirmed').length,
                signed_up: upcoming.filter(e => e.participation_status === 'Signed Up').length
            }
        }
    }

    // Event templates
    async getEventTemplates() {
        await this.init()
        if (this.isElectron) return await this.electronAPI.templates.getAll()
        // web mode fallback
        return JSON.parse(localStorage.getItem('nw_event_templates') || '[]')
    }

    async createEventTemplate(tpl) {
        await this.init()
        if (this.isElectron) return await this.electronAPI.templates.create(tpl)
        const all = JSON.parse(localStorage.getItem('nw_event_templates') || '[]')
        const withId = { id: Date.now(), ...tpl }
        all.push(withId)
        localStorage.setItem('nw_event_templates', JSON.stringify(all))
        return withId
    }

    async updateEventTemplate(id, partial) {
        await this.init()
        if (this.isElectron) return await this.electronAPI.templates.update(id, partial)
        const all = JSON.parse(localStorage.getItem('nw_event_templates') || '[]')
        const idx = all.findIndex(t => t.id === id)
        if (idx !== -1) {
            all[idx] = { ...all[idx], ...partial }
            localStorage.setItem('nw_event_templates', JSON.stringify(all))
            return all[idx]
        }
        return null
    }

    async deleteEventTemplate(id) {
        await this.init()
        if (this.isElectron) return await this.electronAPI.templates.delete(id)
        const all = JSON.parse(localStorage.getItem('nw_event_templates') || '[]')
        const filtered = all.filter(t => t.id !== id)
        localStorage.setItem('nw_event_templates', JSON.stringify(filtered))
        return true
    }

    // Helper methods for New World specific events
    async createWarEvent(eventData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.createWar(eventData)
        } else {
            return await this.createEvent({
                ...eventData,
                event_type: 'War',
                notification_enabled: true,
                notification_minutes: 60
            })
        }
    }

    async createInvasionEvent(eventData) {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.events.createInvasion(eventData)
        } else {
            return await this.createEvent({
                ...eventData,
                event_type: 'Invasion',
                notification_enabled: true,
                notification_minutes: 30
            })
        }
    }

    getMockEvents() {
        // Get from localStorage only - no default mock data
        const stored = localStorage.getItem('nw_events')
        return stored ? JSON.parse(stored) : []
    }

    // Data management functions
    async deleteAllData() {
        await this.init()
        
        if (this.isElectron) {
            // For Electron, we need to clear the database
            return await this.electronAPI.database.deleteAllData()
        } else {
            // For web mode, clear all localStorage data
            localStorage.removeItem('nw_characters')
            localStorage.removeItem('nw_tasks')
            localStorage.removeItem('nw_events')
            localStorage.removeItem('nw_task_completions')
            localStorage.removeItem('nw_task_assignments')
            return true
        }
    }

    async exportData() {
        await this.init()
        
        if (this.isElectron) {
            return await this.electronAPI.database.exportData()
        } else {
            // Export localStorage data
            const data = {
                characters: this.getMockCharacters(),
                tasks: this.getMockTasks(),
                events: this.getMockEvents(),
                exportedAt: new Date().toISOString()
            }
            return data
        }
    }
}

// Export a singleton instance
export default new ApiService() 