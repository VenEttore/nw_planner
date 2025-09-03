import { app, BrowserWindow, Menu, shell, dialog, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { isDev } from './utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow
let database
let characterService
let taskService
let eventService
let serverService
let eventTemplateService
let participationStatusService
let steamAccountService
let resetSchedulerInterval = null

// Import services
async function initializeServices() {
    const databaseService = await import('../src/services/database.js')
    const characterServiceModule = await import('../src/services/characterService.js')
    const taskServiceModule = await import('../src/services/taskService.js')
    const eventServiceModule = await import('../src/services/eventService.js')
    const serverServiceModule = await import('../src/services/serverService.js')
    const eventTemplateServiceModule = await import('../src/services/eventTemplateService.js')
    const participationStatusServiceModule = await import('../src/services/participationStatusService.js')
    const steamAccountServiceModule = await import('../src/services/steamAccountService.js')
    
    // Use the singleton instances
    database = databaseService.default
    characterService = characterServiceModule.default
    taskService = taskServiceModule.default
    eventService = eventServiceModule.default
    serverService = serverServiceModule.default
    eventTemplateService = eventTemplateServiceModule.default
    participationStatusService = participationStatusServiceModule.default
    steamAccountService = steamAccountServiceModule.default
    
    // Initialize the database
    await database.init(app.getPath('userData'))
    

		// Initialize default servers if needed
		await serverService.initializeDefaultServers()

		// Initialize default tasks if none exist
		try {
			// This is idempotent; only inserts when a task name is missing
			database.insertDefaultTasks()
		} catch (error) {
			console.warn('Default task initialization skipped:', error)
		}
    
    // Ensure other services are initialized
    await characterService.ensureInitialized()
    await taskService.ensureInitialized()
    await eventService.ensureInitialized()
    await eventTemplateService.ensureInitialized()
    await participationStatusService.ensureInitialized()
    await steamAccountService.ensureInitialized()
}

// IPC Handlers
function setupIpcHandlers() {
    // Character operations
    ipcMain.handle('character:getAll', async () => {
        return await characterService.getAll()
    })
    
    ipcMain.handle('character:getActive', async () => {
        return await characterService.getActive()
    })
    
    ipcMain.handle('character:create', async (event, characterData) => {
        return await characterService.create(characterData)
    })
    
    ipcMain.handle('character:update', async (event, id, characterData) => {
        return await characterService.update(id, characterData)
    })
    
    ipcMain.handle('character:delete', async (event, id) => {
        return await characterService.delete(id)
    })
    
    ipcMain.handle('character:getById', async (event, id) => {
        return await characterService.getById(id)
    })
    
    ipcMain.handle('character:updateActiveStatus', async (event, id, activeStatus) => {
        return await characterService.updateActiveStatus(id, activeStatus)
    })
    
    ipcMain.handle('character:getServerList', async () => {
        return await characterService.getServerList()
    })
    
    ipcMain.handle('character:getStatistics', async () => {
        return await characterService.getStatistics()
    })
    
    ipcMain.handle('character:getAllWithServerTime', async () => {
        return await characterService.getAllWithServerTime()
    })
    
    // Server operations
    ipcMain.handle('server:getAll', async () => {
        return await serverService.getAll()
    })
    
    ipcMain.handle('server:getActive', async () => {
        return await serverService.getActive()
    })
    
    ipcMain.handle('server:create', async (event, serverData) => {
        return await serverService.create(serverData)
    })
    
    ipcMain.handle('server:update', async (event, id, serverData) => {
        return await serverService.update(id, serverData)
    })
    
    ipcMain.handle('server:delete', async (event, id) => {
        return await serverService.delete(id)
    })
    
    ipcMain.handle('server:getById', async (event, id) => {
        return await serverService.getById(id)
    })
    
    ipcMain.handle('server:updateActiveStatus', async (event, id, activeStatus) => {
        return await serverService.updateActiveStatus(id, activeStatus)
    })
    
    ipcMain.handle('server:getByRegion', async (event, region) => {
        return await serverService.getByRegion(region)
    })
    
    ipcMain.handle('server:getStatistics', async () => {
        return await serverService.getStatistics()
    })
    
    ipcMain.handle('server:getRegionList', async () => {
        return await serverService.getRegionList()
    })
    
    ipcMain.handle('server:getServerNameList', async () => {
        return await serverService.getServerNameList()
    })
    
    ipcMain.handle('server:getServerTimezone', async (event, serverName) => {
        return await serverService.getServerTimezone(serverName)
    })
    
    ipcMain.handle('server:initializeDefaultServers', async () => {
        return await serverService.initializeDefaultServers()
    })

    // Server import/clear
    ipcMain.handle('server:importFromFile', async (event, filePath) => {
        return await serverService.importFromFile(filePath)
    })

    ipcMain.handle('server:appendFromSnapshot', async (event, snapshotObject) => {
        return await serverService.appendFromSnapshotObject(snapshotObject)
    })

    ipcMain.handle('server:clearUnused', async () => {
        return await serverService.clearUnusedServers()
    })

    ipcMain.handle('server:retrieveLatest', async () => {
        const url = 'https://nwdb.info/server-status/servers_24h.json'
        try {
            const res = await fetch(url)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const json = await res.json()
            return await serverService.appendFromSnapshotObject(json)
        } catch (error) {
            console.error('Failed to retrieve server list:', error)
            throw error
        }
    })
    
    // Task operations
    ipcMain.handle('task:getAll', async () => {
        return await taskService.getAllTasks()
    })
    
    ipcMain.handle('task:getByType', async (event, type) => {
        return await taskService.getTasksByType(type)
    })
    
    ipcMain.handle('task:create', async (event, taskData) => {
        return await taskService.createTask(taskData)
    })
    
    ipcMain.handle('task:update', async (event, id, taskData) => {
        return await taskService.updateTask(id, taskData)
    })
    
    ipcMain.handle('task:delete', async (event, id) => {
        return await taskService.deleteTask(id)
    })
    
    ipcMain.handle('task:assignToCharacter', async (event, taskId, characterId) => {
        return await taskService.assignTaskToCharacter(taskId, characterId)
    })
    
    ipcMain.handle('task:removeAssignment', async (event, taskId, characterId) => {
        return await taskService.removeTaskAssignment(taskId, characterId)
    })
    
    ipcMain.handle('task:assignToCharacters', async (event, taskId, characterIds) => {
        return await taskService.assignTaskToCharacters(taskId, characterIds)
    })
    
    ipcMain.handle('task:assignTasksToCharacter', async (event, taskIds, characterId) => {
        return await taskService.assignTasksToCharacter(taskIds, characterId)
    })
    
    ipcMain.handle('task:setTaskAssignments', async (event, taskId, characterIds) => {
        return await taskService.setTaskAssignments(taskId, characterIds)
    })
    
    ipcMain.handle('task:getAssignedCharactersForTask', async (event, taskId) => {
        return await taskService.getAssignedCharactersForTask(taskId)
    })
    
    ipcMain.handle('task:getCharacterTasks', async (event, characterId) => {
        return await taskService.getCharacterTasksWithStatus(characterId)
    })
    
    ipcMain.handle('task:markComplete', async (event, taskId, characterId, resetPeriod) => {
        return await taskService.markTaskComplete(taskId, characterId, resetPeriod)
    })
    
    ipcMain.handle('task:markIncomplete', async (event, taskId, characterId, resetPeriod) => {
        return await taskService.markTaskIncomplete(taskId, characterId, resetPeriod)
    })
    
    ipcMain.handle('task:getCompletions', async (event, characterId, resetPeriod) => {
        return await taskService.getCharacterCompletions(characterId, resetPeriod)
    })
    
    ipcMain.handle('task:getStats', async () => {
        return await taskService.getTaskStats()
    })

    // Manual resets
    ipcMain.handle('task:manualReset', async (event, type) => {
        return await taskService.resetCurrentPeriodForAllCharacters(type)
    })
    
    // Task defaults initialization (manual trigger)
    ipcMain.handle('task:initializeDefaults', async () => {
        try {
            database.insertDefaultTasks()
            return true
        } catch (error) {
            console.error('Failed to initialize default tasks:', error)
            return false
        }
    })
    
    // Event operations
    ipcMain.handle('event:getAll', async () => {
        return await eventService.getAllEvents()
    })
    
    ipcMain.handle('event:getByCharacter', async (event, characterId) => {
        return await eventService.getEventsByCharacter(characterId)
    })
    
    ipcMain.handle('event:getByServer', async (event, serverName) => {
        return await eventService.getEventsByServer(serverName)
    })
    
    ipcMain.handle('event:getByDateRange', async (event, startDate, endDate) => {
        return await eventService.getEventsByDateRange(startDate, endDate)
    })
    
    ipcMain.handle('event:getUpcoming', async (event, limit) => {
        return await eventService.getUpcomingEvents(limit)
    })
    
    ipcMain.handle('event:create', async (event, eventData) => {
        return await eventService.createEvent(eventData)
    })
    
    ipcMain.handle('event:update', async (event, id, eventData) => {
        return await eventService.updateEvent(id, eventData)
    })
    
    ipcMain.handle('event:delete', async (event, id) => {
        return await eventService.deleteEvent(id)
    })
    
    // Fetch single event by id (used to reconcile after inline updates)
    ipcMain.handle('event:getById', async (event, id) => {
        return await eventService.getEventById(id)
    })
    
    ipcMain.handle('event:updateRsvp', async (event, eventId, status) => {
        return await eventService.updateParticipationStatus(eventId, status)
    })
    
    ipcMain.handle('event:getForCalendar', async (event, startDate, endDate) => {
        return await eventService.getEventsForCalendar(startDate, endDate)
    })
    
    ipcMain.handle('event:getConflicts', async (event, characterId, eventTime, excludeEventId) => {
        return await eventService.getConflictingEvents(characterId, eventTime, excludeEventId)
    })
    
    ipcMain.handle('event:getStats', async () => {
        return await eventService.getEventStats()
    })
    
    ipcMain.handle('event:createWar', async (event, eventData) => {
        return await eventService.createWarEvent(eventData)
    })
    
    ipcMain.handle('event:createInvasion', async (event, eventData) => {
        return await eventService.createInvasionEvent(eventData)
    })
    
    ipcMain.handle('event:createCompanyEvent', async (event, eventData) => {
        return await eventService.createCompanyEvent(eventData)
    })

    // Event templates operations
    ipcMain.handle('template:getAll', async () => {
        return await eventTemplateService.getAll()
    })
    ipcMain.handle('template:create', async (event, templateData) => {
        return await eventTemplateService.create(templateData)
    })
    ipcMain.handle('template:update', async (event, id, partial) => {
        return await eventTemplateService.update(id, partial)
    })
    ipcMain.handle('template:delete', async (event, id) => {
        return await eventTemplateService.delete(id)
    })

    // Participation statuses operations
    ipcMain.handle('status:getAll', async () => {
        return await participationStatusService.getAll()
    })
    ipcMain.handle('status:create', async (event, payload) => {
        return await participationStatusService.create(payload)
    })
    ipcMain.handle('status:update', async (event, id, payload) => {
        return await participationStatusService.update(id, payload)
    })
    ipcMain.handle('status:delete', async (event, id, remap) => {
        return await participationStatusService.delete(id, remap)
    })

    // Steam accounts operations
    ipcMain.handle('steam:getAll', async () => {
        return await steamAccountService.getAll()
    })
    ipcMain.handle('steam:getById', async (event, id) => {
        return await steamAccountService.getById(id)
    })
    ipcMain.handle('steam:create', async (event, payload) => {
        return await steamAccountService.create(payload)
    })
    ipcMain.handle('steam:update', async (event, id, payload) => {
        return await steamAccountService.update(id, payload)
    })
    ipcMain.handle('steam:delete', async (event, id, options) => {
        return await steamAccountService.delete(id, options)
    })
    
    // Database operations
    ipcMain.handle('database:isReady', async () => {
        return database.initialized
    })
    
    ipcMain.handle('database:deleteAllData', async () => {
        await database.deleteAllData()
        return true
    })
    
    ipcMain.handle('database:exportData', async () => {
        return await database.exportData()
    })
    
    console.log('IPC handlers set up')
}

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, '../assets/icon.png'),
        show: false,
        titleBarStyle: 'default'
    })

    // Load the app
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173')
        mainWindow.webContents.openDevTools()
    } else {
        // Point to Vite's renderer output (see vite.config outDir)
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    })

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null
    })

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })
}

// App event handlers
app.whenReady().then(async () => {
    await initializeServices()
    setupIpcHandlers()
    // Start reset scheduler (hourly, aligned to top of hour)
    try {
        const runResetTick = async () => {
            try {
                const chars = await characterService.getActive()
                let shouldReload = false
                for (const ch of chars) {
                    if (!ch?.server_timezone) continue
                    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: ch.server_timezone, weekday: 'short' }).format(new Date())
                    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ch.server_timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
                    const H = parseInt(parts.find(p => p.type === 'hour').value, 10)
                    const M = parseInt(parts.find(p => p.type === 'minute').value, 10)
                    if (H === 5 && M === 0) {
                        try { await taskService.clearCompletionsForCharacterByType(ch.id, 'daily') } catch {}
                        if (weekday === 'Tue') {
                            try { await taskService.clearCompletionsForCharacterByType(ch.id, 'weekly') } catch {}
                        }
                        shouldReload = true
                    }
                }
                if (shouldReload && mainWindow && mainWindow.webContents) {
                    try { mainWindow.webContents.reloadIgnoringCache() } catch (_) { try { mainWindow.reload() } catch {} }
                }
            } catch (e) {
                console.error('Reset scheduler tick failed:', e)
            }
        }

        const scheduleHourly = () => {
            try {
                if (resetSchedulerInterval) { clearInterval(resetSchedulerInterval); resetSchedulerInterval = null }
                const now = new Date()
                const msToNextHour = (60 - now.getMinutes()) * 60000 - now.getSeconds() * 1000 - now.getMilliseconds()
                setTimeout(() => {
                    runResetTick()
                    resetSchedulerInterval = setInterval(runResetTick, 60 * 60 * 1000)
                }, Math.max(msToNextHour, 1000))
            } catch (e) {
                console.error('Failed to schedule reset scheduler:', e)
            }
        }

        scheduleHourly()
    } catch (e) {
        console.error('Failed to start reset scheduler:', e)
    }
    createWindow()
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (resetSchedulerInterval) { try { clearInterval(resetSchedulerInterval) } catch {} resetSchedulerInterval = null }
        if (database) {
            database.close()
        }
        app.quit()
    }
})

app.on('before-quit', () => {
    if (resetSchedulerInterval) { try { clearInterval(resetSchedulerInterval) } catch {} resetSchedulerInterval = null }
    if (database) {
        database.close()
    }
})

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl)
        
        if (parsedUrl.origin !== 'http://localhost:5173' && parsedUrl.origin !== 'file://') {
            event.preventDefault()
        }
    })
}) 