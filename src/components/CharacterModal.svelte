<script>
  import { createEventDispatcher } from 'svelte'
  import api from '../services/api.js'
  
  export let isOpen = false
  export let character = null // null for create, character object for edit
  
  let servers = []
  let serversLoading = true
  let steamAccounts = []
  let steamLoading = false
  
  const dispatch = createEventDispatcher()
  
  // Form data
  let formData = {
    name: '',
    server_name: '',
    server_timezone: '',
    faction: 'Factionless',
    company: '',
    steam_account_id: null,
    active_status: true,
    notes: ''
  }
  
  // Get timezone for selected server
  function getServerTimezone(serverName) {
    const server = servers.find(s => s.name === serverName)
    return server ? server.timezone : ''
  }
  
  let loading = false
  let errors = {}
  let showInlineSteamForm = false
  let newSteam = { label: '', notes: '' }
  
  // Prevent re-initializing form while typing; only initialize when opening or switching target
  let initializedForId = null
  
  // Load servers when modal opens
  $: if (isOpen) {
    const currentTargetId = character?.id ?? '__create__'
    if (initializedForId !== currentTargetId) {
      loadServers()
      loadSteamAccounts(true)
      
      if (character) {
        // Edit mode
        formData = {
          name: character.name || '',
          server_name: character.server_name || '',
          server_timezone: character.server_timezone || '',
          faction: character.faction || 'Factionless',
          company: character.company || '',
          steam_account_id: character.steam_account_id || null,
          active_status: character.active_status !== undefined ? character.active_status : true,
          notes: character.notes || ''
        }
      } else {
        // Create mode
        formData = {
          name: '',
          server_name: '',
          server_timezone: '',
          faction: 'Factionless',
          company: '',
          steam_account_id: null,
          active_status: true,
          notes: ''
        }
      }
      errors = {}
      initializedForId = currentTargetId
    }
  }
  
  // Auto-set timezone when server changes
  $: if (formData.server_name) {
    const timezone = getServerTimezone(formData.server_name)
    if (timezone) {
      formData.server_timezone = timezone
    }
  }

  // React to "Add new…" selection
  $: if (formData?.steam_account_id === '__add_new__') {
    showInlineSteamForm = true
  }

  async function createInlineSteamAccount() {
    try {
      const created = await api.createSteamAccount({ label: newSteam.label, notes: newSteam.notes || null })
      await loadSteamAccounts(true)
      formData.steam_account_id = created?.id || null
      showInlineSteamForm = false
      newSteam = { label: '', notes: '' }
    } catch (e) {
      console.error('Failed to create Steam account:', e)
    }
  }
  
  // Load servers function
  async function loadServers() {
    if (servers.length > 0) return // Already loaded
    
    serversLoading = true
    try {
      const allServers = await api.getActiveServers()
      servers = allServers
    } catch (error) {
      console.error('Error loading servers:', error)
      // Fallback to getting server list from API
      try {
        const serverNames = await api.getServerList()
        servers = serverNames.map(name => ({ name, timezone: 'America/New_York' }))
      } catch (fallbackError) {
        console.error('Error loading server list:', fallbackError)
        servers = []
      }
    } finally {
      serversLoading = false
    }
  }

  async function loadSteamAccounts(force = false) {
    if (steamAccounts.length > 0 && !force) return
    steamLoading = true
    try {
      steamAccounts = await api.getSteamAccounts()
    } catch (e) {
      console.error('Failed to load Steam accounts:', e)
      steamAccounts = []
    } finally {
      steamLoading = false
    }
  }
  
  function validateForm() {
    errors = {}
    
    if (!formData.name.trim()) {
      errors.name = 'Character name is required'
    }
    
    if (!formData.server_name) {
      errors.server_name = 'Server is required'
    }
    
    // Faction is optional - defaults to 'Factionless'
    if (!formData.faction) {
      formData.faction = 'Factionless'
    }
    
    return Object.keys(errors).length === 0
  }
  
  async function handleSubmit() {
    if (!validateForm()) return
    
    loading = true
    
    try {
      let result
      if (character) {
        // Edit existing character
        result = await api.updateCharacter(character.id, formData)
      } else {
        // Create new character
        result = await api.createCharacter(formData)
      }
      
      if (result) {
        dispatch('saved', result)
        close()
      }
    } catch (error) {
      console.error('Error saving character:', error)
      errors.submit = 'Failed to save character. Please try again.'
    } finally {
      loading = false
    }
  }
  
  function close() {
    isOpen = false
    initializedForId = null
    formData = {
      name: '',
      server_name: '',
      server_timezone: '',
      faction: '',
      company: '',
      active_status: true,
      notes: ''
    }
    errors = {}
  }
  
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      close()
    }
  }
</script>

{#if isOpen}
  <!-- Modal backdrop -->
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-modal="true" on:click={close} on:keydown={handleKeydown}>
    <!-- Modal content -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4" role="document" on:click|stopPropagation on:keydown|stopPropagation>
      <div class="p-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          {character ? 'Edit Character' : 'Create New Character'}
        </h2>
        
        <form on:submit|preventDefault={handleSubmit} class="space-y-4">
          <!-- Character Name -->
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Character Name *
            </label>
            <input
              type="text"
              id="name"
              bind:value={formData.name}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-nw-blue dark:bg-gray-700 dark:text-white"
              class:border-red-500={errors.name}
              placeholder="Enter character name"
              required
            />
            {#if errors.name}
              <p class="mt-1 text-sm text-red-600">{errors.name}</p>
            {/if}
          </div>
          
          <!-- Steam Account -->
          <div>
            <label for="steam" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Steam Account
            </label>
            <select
              id="steam"
              bind:value={formData.steam_account_id}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-nw-blue dark:bg-gray-700 dark:text-white"
              disabled={steamLoading}
            >
              <option value={null}>(None)</option>
              {#each steamAccounts as acc}
                <option value={acc.id}>{acc.label}</option>
              {/each}
              <option value="__add_new__">Add new…</option>
            </select>
          </div>

          <!-- Server -->
          <div>
            <label for="server" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Server *
            </label>
            <select
              id="server"
              bind:value={formData.server_name}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-nw-blue dark:bg-gray-700 dark:text-white"
              class:border-red-500={errors.server_name}
              disabled={serversLoading}
              required
            >
              <option value="">
                {serversLoading ? 'Loading servers...' : 'Select a server'}
              </option>
              {#each servers as server}
                <option value={server.name || server}>
                  {server.name || server}
                  {#if server.region}
                    ({server.region})
                  {/if}
                </option>
              {/each}
            </select>
            {#if errors.server_name}
              <p class="mt-1 text-sm text-red-600">{errors.server_name}</p>
            {/if}
          </div>
          
                      <!-- Faction -->
          <div>
            <label for="faction" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Faction
            </label>
            <select
              id="faction"
              bind:value={formData.faction}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-nw-blue dark:bg-gray-700 dark:text-white"
              class:border-red-500={errors.faction}
            >
              <option value="Factionless">Factionless</option>
              <option value="Marauders">Marauders</option>
              <option value="Covenant">Covenant</option>
              <option value="Syndicate">Syndicate</option>
            </select>
            {#if errors.faction}
              <p class="mt-1 text-sm text-red-600">{errors.faction}</p>
            {/if}
          </div>
          
          <!-- Company -->
          <div>
            <label for="company" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Company (Optional)
            </label>
            <input
              type="text"
              id="company"
              bind:value={formData.company}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-nw-blue dark:bg-gray-700 dark:text-white"
              placeholder="Enter company name"
            />
          </div>
          
          <!-- Active Status -->
          <div class="flex items-center">
            <input
              type="checkbox"
              id="active"
              bind:checked={formData.active_status}
              class="h-4 w-4 text-nw-blue focus:ring-nw-blue border-gray-300 rounded"
            />
            <label for="active" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Active Character
            </label>
          </div>
          
          {#if showInlineSteamForm}
          <div class="border rounded-md p-3 bg-gray-50 dark:bg-gray-900" role="group" aria-labelledby="newSteamLegend">
            <div id="newSteamLegend" class="sr-only">New Steam Account</div>
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label for="newSteamLabel" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Steam Account Label *</label>
                <input id="newSteamLabel" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={newSteam.label} required />
              </div>
              <div>
                <label for="newSteamNotes" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
                <input id="newSteamNotes" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={newSteam.notes} />
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-3">
              <button type="button" class="px-3 py-2 border rounded-md" on:click={() => { showInlineSteamForm=false; formData.steam_account_id=null }}>Cancel</button>
              <button type="button" class="px-3 py-2 rounded-md text-white bg-nw-blue" on:click={createInlineSteamAccount} disabled={!newSteam.label.trim()}>Create</button>
            </div>
          </div>
          {/if}

          <!-- Notes -->
          <div>
            <label for="notes" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              bind:value={formData.notes}
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-nw-blue dark:bg-gray-700 dark:text-white"
              placeholder="Add any notes about this character..."
            ></textarea>
          </div>
          
          {#if errors.submit}
            <p class="text-sm text-red-600">{errors.submit}</p>
          {/if}
          
          <!-- Buttons -->
          <div class="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              on:click={close}
              class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nw-blue"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-nw-blue hover:bg-nw-blue-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nw-blue disabled:opacity-50"
              disabled={loading}
            >
              {#if loading}
                <span class="flex items-center">
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              {:else}
                {character ? 'Update Character' : 'Create Character'}
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

 