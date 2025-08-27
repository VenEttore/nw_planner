<script>
  import { onMount } from 'svelte'
  import { darkMode, notifications } from '../stores/ui'
  import api from '../services/api.js'
  import ServerModal from '../components/ServerModal.svelte'
  import StatusModal from '../components/StatusModal.svelte'
  
  let loading = true
  let darkModeEnabled = false
  let notificationSettings = {
    desktop: true,
    sound: false,
    dailyReset: true,
    weeklyReset: true,
    events: true
  }
  
  let showDeleteConfirmation = false
  let deleteInProgress = false
  
  // Server management
  let servers = []
  let showServerModal = false
  let editingServer = null
  let serverLoading = true
  let serverStats = { total: 0, active: 0, inactive: 0 }
  let retrieveLoading = false

  // Participation statuses
  let statuses = []
  let statusLoading = true
  let showStatusModal = false
  let editingStatus = null
  async function loadStatuses(){
    statusLoading = true
    try { statuses = await api.getParticipationStatuses() } catch { statuses = [] }
    finally { statusLoading = false }
  }
  
  
  
  onMount(async () => {
    setTimeout(() => {
      loading = false
    }, 500)
    
    // Subscribe to stores
    const unsubscribeDark = darkMode.subscribe(value => {
      darkModeEnabled = value
    })
    
    const unsubscribeNotifications = notifications.subscribe(value => {
      notificationSettings = value
    })
    
    // Load servers
    await loadServers()
    await loadServerStats()
    await loadStatuses()
    
    return () => {
      unsubscribeDark()
      unsubscribeNotifications()
    }
  })
  
  function toggleDarkMode() {
    darkMode.update(value => !value)
  }
  
  function updateNotificationSetting(setting, value) {
    notifications.update(current => ({
      ...current,
      [setting]: value
    }))
  }
  
  function showDeleteModal() {
    showDeleteConfirmation = true
  }
  
  function hideDeleteModal() {
    showDeleteConfirmation = false
  }
  
  async function confirmDeleteAllData() {
    deleteInProgress = true
    try {
      await api.deleteAllData()
      showDeleteConfirmation = false
      // Show success message
      const { showAlert } = await import('../stores/dialog.js')
      await showAlert('All data has been successfully deleted. The application will now be clean.', 'Success', 'OK')
      // Optionally reload the page to reflect changes
      window.location.reload()
    } catch (error) {
      console.error('Error deleting data:', error)
      const { showAlert } = await import('../stores/dialog.js')
      await showAlert('Failed to delete data. Please try again.', 'Error', 'OK')
    } finally {
      deleteInProgress = false
    }
  }
  
  async function exportData() {
    try {
      const data = await api.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nw-planner-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting data:', error)
      const { showAlert } = await import('../stores/dialog.js')
      await showAlert('Failed to export data. Please try again.', 'Error', 'OK')
    }
  }

  // Server management functions
  async function loadServers() {
    serverLoading = true
    try {
      servers = await api.getServers()
    } catch (error) {
      console.error('Error loading servers:', error)
    } finally {
      serverLoading = false
    }
  }

  async function loadServerStats() {
    try {
      serverStats = await api.getServerStatistics()
    } catch (error) {
      console.error('Error loading server statistics:', error)
      serverStats = { total: servers?.length || 0, active: (servers || []).filter(s => s.active_status).length, inactive: (servers || []).filter(s => !s.active_status).length }
    }
  }

  

  function openServerModal(server = null) {
    editingServer = server
    showServerModal = true
  }

  function closeServerModal() {
    showServerModal = false
    editingServer = null
  }

  async function handleServerSaved() {
    await loadServers()
    await loadServerStats()
    closeServerModal()
  }

  async function toggleServerStatus(server) {
    try {
      await api.updateServerActiveStatus(server.id, !server.active_status)
      await loadServers()
      await loadServerStats()
    } catch (error) {
      console.error('Error updating server status:', error)
      const { showAlert } = await import('../stores/dialog.js')
      await showAlert('Error updating server status: ' + error.message, 'Error', 'OK')
    }
  }

  async function deleteServer(server) {
    const { showConfirm, showAlert } = await import('../stores/dialog.js')
    const ok = await showConfirm(`Are you sure you want to delete server "${server.name}"? This action cannot be undone.`, 'Delete Server', 'Delete', 'Cancel')
    if (ok) {
      try {
        await api.deleteServer(server.id)
        await loadServers()
        await loadServerStats()
      } catch (error) {
        console.error('Error deleting server:', error)
        await showAlert('Error deleting server: ' + error.message, 'Error', 'OK')
      }
    }
  }

  async function retrieveLatestServers() {
    try {
      retrieveLoading = true
      const { showAlert } = await import('../stores/dialog.js')
      const result = await api.retrieveLatestServers()
      await loadServers()
      await loadServerStats()
      await showAlert(`Retrieved latest list. Inserted: ${result.inserted}\nDuplicates: ${result.duplicates}\nInactive skipped: ${result.skippedInactive}\nUnknown region skipped: ${result.skippedUnknownRegion}`, 'Retrieve Server List', 'OK')
    } catch (error) {
      console.error('Error retrieving servers:', error)
      const { showAlert } = await import('../stores/dialog.js')
      await showAlert('Failed to retrieve server list: ' + (error?.message || error), 'Error', 'OK')
    } finally {
      retrieveLoading = false
    }
  }

  async function clearUnusedServers() {
    try {
      const { showConfirm, showAlert } = await import('../stores/dialog.js')
      const ok = await showConfirm('Delete all servers that are not referenced by any characters or events?', 'Clear Unused Servers', 'Delete', 'Cancel')
      if (!ok) return
      const result = await api.clearUnusedServers()
      await loadServers()
      await loadServerStats()
      await showAlert(`Clear complete. Deleted: ${result.deleted}\nSkipped (in use): ${result.skippedInUse}`, 'Clear Unused Servers', 'OK')
    } catch (error) {
      console.error('Error clearing unused servers:', error)
      const { showAlert } = await import('../stores/dialog.js')
      await showAlert('Failed to clear servers: ' + (error?.message || error), 'Error', 'OK')
    }
  }

  // Participation status handlers
  function openStatusModal(s=null){ editingStatus = s; showStatusModal = true }
  function closeStatusModal(){ showStatusModal = false; editingStatus = null }
  async function saveStatus(e){
    const data = e.detail
    if (editingStatus) await api.updateParticipationStatus(editingStatus.id, data)
    else await api.createParticipationStatus(data)
    await loadStatuses(); closeStatusModal()
  }
  async function deleteStatus(s){
    const { showConfirm } = await import('../stores/dialog.js')
    const ok = await showConfirm(`Delete status "${s.name}"?`, 'Delete Status', 'Delete', 'Cancel')
    if (!ok) return
    try { await api.deleteParticipationStatus(s.id, null); await loadStatuses() } catch (e) { console.error('Delete status failed', e) }
  }
</script>

<div class="max-w-7xl mx-auto">
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
    <p class="text-gray-600 dark:text-gray-400">Configure your application preferences.</p>
  </div>
  
  {#if loading}
    <div class="flex items-center justify-center h-64">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-nw-blue"></div>
    </div>
  {:else}
    <div class="space-y-6">
      <!-- Appearance Settings -->
      <div class="card">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Appearance</h2>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Dark Mode</span>
              <p class="text-sm text-gray-600 dark:text-gray-400">Switch between light and dark themes</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={darkModeEnabled} on:change={toggleDarkMode} class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
      
      <!-- Notification Settings -->
      <div class="card">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Notifications</h2>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Desktop Notifications</span>
              <p class="text-sm text-gray-600 dark:text-gray-400">Show desktop notifications</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={notificationSettings.desktop} on:change={(e) => updateNotificationSetting('desktop', e.target.checked)} class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Sound Alerts</span>
              <p class="text-sm text-gray-600 dark:text-gray-400">Play sound with notifications</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={notificationSettings.sound} on:change={(e) => updateNotificationSetting('sound', e.target.checked)} class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Daily Reset Notifications</span>
              <p class="text-sm text-gray-600 dark:text-gray-400">Notify when daily tasks reset</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={notificationSettings.dailyReset} on:change={(e) => updateNotificationSetting('dailyReset', e.target.checked)} class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Weekly Reset Notifications</span>
              <p class="text-sm text-gray-600 dark:text-gray-400">Notify when weekly tasks reset</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={notificationSettings.weeklyReset} on:change={(e) => updateNotificationSetting('weeklyReset', e.target.checked)} class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Event Notifications</span>
              <p class="text-sm text-gray-600 dark:text-gray-400">Notify about upcoming events</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={notificationSettings.events} on:change={(e) => updateNotificationSetting('events', e.target.checked)} class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
      
      <!-- Server Management -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Server Management</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Servers: <span class="font-medium">{serverStats.total}</span>
              <span class="mx-2">•</span>
              Active: <span class="font-medium text-green-700 dark:text-green-300">{serverStats.active}</span>
              <span class="mx-2">•</span>
              Inactive: <span class="font-medium text-gray-700 dark:text-gray-300">{serverStats.inactive}</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button on:click={() => openServerModal()} class="px-4 py-2 bg-nw-blue text-white rounded-md hover:bg-nw-blue-dark transition-colors">Add Server</button>
            <button on:click={retrieveLatestServers} disabled={retrieveLoading} class="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
              {#if retrieveLoading}
                <svg class="animate-spin h-4 w-4 text-gray-700 dark:text-gray-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0a12 12 0 100 24v-4a8 8 0 01-8-8z"></path>
                </svg>
                Retrieving...
              {:else}
                Retrieve Server List
              {/if}
            </button>
            <button on:click={clearUnusedServers} class="px-3 py-2 bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-200 rounded-md hover:bg-red-100 dark:hover:bg-red-800 transition-colors">Clear Unused</button>
          </div>
        </div>
        
        {#if serverLoading}
          <div class="flex items-center justify-center h-32">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-nw-blue"></div>
          </div>
        {:else if servers.length === 0}
          <div class="text-center py-8">
            <p class="text-gray-500 dark:text-gray-400">No servers configured.</p>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-2">Click "Add Server" to get started.</p>
          </div>
        {:else}
          <div class="space-y-2">
            {#each servers as server}
              <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="flex items-center space-x-3">
                  <div class="flex-shrink-0">
                    {#if server.active_status}
                      <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                    {:else}
                      <div class="w-2 h-2 bg-gray-400 rounded-full"></div>
                    {/if}
                  </div>
                  <div>
                    <div class="font-medium text-gray-900 dark:text-white">{server.name}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">{server.region} • {server.timezone}</div>
                  </div>
                </div>
                <div class="flex items-center space-x-2">
                  <button on:click={() => toggleServerStatus(server)} class="text-sm px-3 py-1 rounded-md {server.active_status ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}">{server.active_status ? 'Active' : 'Inactive'}</button>
                  <button on:click={() => openServerModal(server)} class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">Edit</button>
                  <button on:click={() => deleteServer(server)} class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      
      <!-- Participation Statuses -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Participation Statuses</h2>
          <button on:click={() => openStatusModal()} class="px-3 py-2 bg-nw-blue text-white rounded-md hover:bg-nw-blue-dark">New Status</button>
        </div>
        {#if statusLoading}
          <div class="flex items-center justify-center h-24"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-nw-blue"></div></div>
        {:else if statuses.length === 0}
          <div class="text-gray-500 dark:text-gray-400">No custom statuses. Defaults are seeded automatically.</div>
        {:else}
          <div class="space-y-2">
            {#each statuses as s}
              <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                <div class="flex items-center gap-3">
                  <span class={`px-2 py-0.5 text-xs rounded ${s.color_bg} ${s.color_text}`}>{s.name}</span>
                  {#if s.is_absent}
                    <span class="text-[10px] text-gray-500">(Absent)</span>
                  {/if}
                </div>
                <div class="flex items-center gap-2">
                  <button class="btn-secondary text-xs" on:click={() => openStatusModal(s)}>Edit</button>
                  <button class="btn-danger text-xs" on:click={() => deleteStatus(s)} disabled={s.is_default}>Delete</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Data Management -->
      <div class="card">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Data Management</h2>
        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Export Data</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Download a backup of all your characters, tasks, and events as a JSON file.
            </p>
            <button 
              on:click={exportData} 
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Export Data
            </button>
          </div>
          
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 class="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
              This will permanently delete all your data including characters, tasks, events, and settings. This action cannot be undone.
            </p>
            <button 
              on:click={showDeleteModal} 
              class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Delete All Data
            </button>
          </div>
        </div>
      </div>
      
      

      <!-- About -->
      <div class="card">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">About</h2>
        <div class="space-y-2">
          <p class="text-sm text-gray-600 dark:text-gray-400">New World Planner v1.0.0</p>
          <p class="text-sm text-gray-600 dark:text-gray-400">A lightweight calendar and task management application for New World MMO players.</p>
              </div>
    </div>
  </div>
{/if}

<!-- Server Modal -->
<ServerModal
  server={editingServer}
  isOpen={showServerModal}
  on:close={closeServerModal}
  on:saved={handleServerSaved}
/>

<StatusModal
  isOpen={showStatusModal}
  status={editingStatus}
  on:cancel={closeStatusModal}
  on:save={saveStatus}
/>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirmation}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
      <div class="p-6">
        <div class="flex items-center mb-4">
          <div class="flex-shrink-0">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Delete All Data</h3>
          </div>
        </div>
        
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Are you sure you want to delete all your data? This will permanently remove:
        </p>
        
        <ul class="text-sm text-gray-600 dark:text-gray-400 mb-6 space-y-1">
          <li>• All characters and their information</li>
          <li>• All tasks and completion history</li>
          <li>• All events and schedules</li>
          <li>• All settings and preferences</li>
        </ul>
        
        <p class="text-sm text-red-600 dark:text-red-400 mb-6 font-medium">
          This action cannot be undone. Make sure to export your data first if you want to keep a backup.
        </p>
        
        <div class="flex items-center justify-end space-x-3">
          <button
            on:click={hideDeleteModal}
            disabled={deleteInProgress}
            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            on:click={confirmDeleteAllData}
            disabled={deleteInProgress}
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if deleteInProgress}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Deleting...
            {:else}
              Delete All Data
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if} 