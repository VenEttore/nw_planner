const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Character operations
    characters: {
        getAll: () => ipcRenderer.invoke('character:getAll'),
        getActive: () => ipcRenderer.invoke('character:getActive'),
        create: (characterData) => ipcRenderer.invoke('character:create', characterData),
        update: (id, characterData) => ipcRenderer.invoke('character:update', id, characterData),
        delete: (id) => ipcRenderer.invoke('character:delete', id),
        getById: (id) => ipcRenderer.invoke('character:getById', id),
        updateActiveStatus: (id, activeStatus) => ipcRenderer.invoke('character:updateActiveStatus', id, activeStatus),
        getServerList: () => ipcRenderer.invoke('character:getServerList'),
        getStatistics: () => ipcRenderer.invoke('character:getStatistics'),
        getAllWithServerTime: () => ipcRenderer.invoke('character:getAllWithServerTime')
    },
    
    // Server operations
    servers: {
        getAll: () => ipcRenderer.invoke('server:getAll'),
        getActive: () => ipcRenderer.invoke('server:getActive'),
        create: (serverData) => ipcRenderer.invoke('server:create', serverData),
        update: (id, serverData) => ipcRenderer.invoke('server:update', id, serverData),
        delete: (id) => ipcRenderer.invoke('server:delete', id),
        getById: (id) => ipcRenderer.invoke('server:getById', id),
        updateActiveStatus: (id, activeStatus) => ipcRenderer.invoke('server:updateActiveStatus', id, activeStatus),
        getByRegion: (region) => ipcRenderer.invoke('server:getByRegion', region),
        getStatistics: () => ipcRenderer.invoke('server:getStatistics'),
        getRegionList: () => ipcRenderer.invoke('server:getRegionList'),
        getServerNameList: () => ipcRenderer.invoke('server:getServerNameList'),
        getServerTimezone: (serverName) => ipcRenderer.invoke('server:getServerTimezone', serverName),
        initializeDefaultServers: () => ipcRenderer.invoke('server:initializeDefaultServers'),
        importFromFile: (filePath) => ipcRenderer.invoke('server:importFromFile', filePath),
        retrieveLatest: () => ipcRenderer.invoke('server:retrieveLatest'),
        clearUnused: () => ipcRenderer.invoke('server:clearUnused')
    },
    
    // Database operations
    database: {
        isReady: () => ipcRenderer.invoke('database:isReady'),
        deleteAllData: () => ipcRenderer.invoke('database:deleteAllData'),
        exportData: () => ipcRenderer.invoke('database:exportData')
    },
    
    // Task operations
    tasks: {
        getAll: () => ipcRenderer.invoke('task:getAll'),
        getByType: (type) => ipcRenderer.invoke('task:getByType', type),
        create: (taskData) => ipcRenderer.invoke('task:create', taskData),
        update: (id, taskData) => ipcRenderer.invoke('task:update', id, taskData),
        delete: (id) => ipcRenderer.invoke('task:delete', id),
        assignToCharacter: (taskId, characterId) => ipcRenderer.invoke('task:assignToCharacter', taskId, characterId),
        removeAssignment: (taskId, characterId) => ipcRenderer.invoke('task:removeAssignment', taskId, characterId),
        getCharacterTasks: (characterId) => ipcRenderer.invoke('task:getCharacterTasks', characterId),
        markComplete: (taskId, characterId, resetPeriod) => ipcRenderer.invoke('task:markComplete', taskId, characterId, resetPeriod),
        markIncomplete: (taskId, characterId, resetPeriod) => ipcRenderer.invoke('task:markIncomplete', taskId, characterId, resetPeriod),
        getCompletions: (characterId, resetPeriod) => ipcRenderer.invoke('task:getCompletions', characterId, resetPeriod),
        getStats: () => ipcRenderer.invoke('task:getStats'),
        assignToCharacters: (taskId, characterIds) => ipcRenderer.invoke('task:assignToCharacters', taskId, characterIds),
        assignTasksToCharacter: (taskIds, characterId) => ipcRenderer.invoke('task:assignTasksToCharacter', taskIds, characterId),
        setTaskAssignments: (taskId, characterIds) => ipcRenderer.invoke('task:setTaskAssignments', taskId, characterIds),
        getAssignedCharactersForTask: (taskId) => ipcRenderer.invoke('task:getAssignedCharactersForTask', taskId)
        , initializeDefaults: () => ipcRenderer.invoke('task:initializeDefaults')
        , manualReset: (type) => ipcRenderer.invoke('task:manualReset', type)
    },
    
    // Event operations
    events: {
        getAll: () => ipcRenderer.invoke('event:getAll'),
        getByCharacter: (characterId) => ipcRenderer.invoke('event:getByCharacter', characterId),
        getByServer: (serverName) => ipcRenderer.invoke('event:getByServer', serverName),
        getByDateRange: (startDate, endDate) => ipcRenderer.invoke('event:getByDateRange', startDate, endDate),
        getUpcoming: (limit) => ipcRenderer.invoke('event:getUpcoming', limit),
        create: (eventData) => ipcRenderer.invoke('event:create', eventData),
        update: (id, eventData) => ipcRenderer.invoke('event:update', id, eventData),
        delete: (id) => ipcRenderer.invoke('event:delete', id),
        updateRsvp: (eventId, status) => ipcRenderer.invoke('event:updateRsvp', eventId, status),
        getById: (id) => ipcRenderer.invoke('event:getById', id),
        getForCalendar: (startDate, endDate) => ipcRenderer.invoke('event:getForCalendar', startDate, endDate),
        getConflicts: (characterId, eventTime, excludeEventId) => ipcRenderer.invoke('event:getConflicts', characterId, eventTime, excludeEventId),
        getStats: () => ipcRenderer.invoke('event:getStats'),
        createWar: (eventData) => ipcRenderer.invoke('event:createWar', eventData),
        createInvasion: (eventData) => ipcRenderer.invoke('event:createInvasion', eventData),
        createCompanyEvent: (eventData) => ipcRenderer.invoke('event:createCompanyEvent', eventData)
    },
    // Event templates
    templates: {
        getAll: () => ipcRenderer.invoke('template:getAll'),
        create: (template) => ipcRenderer.invoke('template:create', template),
        update: (id, partial) => ipcRenderer.invoke('template:update', id, partial),
        delete: (id) => ipcRenderer.invoke('template:delete', id)
    },
    // Participation statuses
    statuses: {
        getAll: () => ipcRenderer.invoke('status:getAll'),
        create: (payload) => ipcRenderer.invoke('status:create', payload),
        update: (id, payload) => ipcRenderer.invoke('status:update', id, payload),
        delete: (id, remap) => ipcRenderer.invoke('status:delete', id, remap)
    },
    
    // Utility functions
    utils: {
        isElectron: () => true,
        platform: process.platform
    }
})

// Log that preload script has loaded
console.log('Preload script loaded') 