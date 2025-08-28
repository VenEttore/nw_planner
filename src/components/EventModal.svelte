<script>
  import { createEventDispatcher } from 'svelte'
  import { format } from 'date-fns'
  import StatusSelect from './StatusSelect.svelte'
  import { zonedTimeToUtc } from 'date-fns-tz'
  
  export let show = false
  export let editingEvent = null
  export let characters = []
  export let isCreating = false
  export let statuses = []
  
  const dispatch = createEventDispatcher()
  
  // Form data
  let formData = {
    name: '',
    description: '',
    event_type: 'Custom',
    server_name: '',
    event_time: '',
    character_id: null,
    participation_status: 'Signed Up',
    location: '',
    recurring_pattern: null,
    notification_enabled: true,
    notification_minutes: 30,
    timezone: ''
  }
  
  // Validation
  let errors = {}
  let isValid = true
  let initializedForKey = null
  let nameInputEl
  let submitting = false
  let timeMode = 'local' // 'local' | 'server'
  let templates = []
  let selectedTemplateId = ''
  export let initialTemplateId = null
  
  // Event types
  const eventTypes = [
    'War',
    'Invasion', 
    'Company Event',
    'PvE',
    'PvP',
    'Custom'
  ]
  
  // Participation statuses (prefer provided prop)
  $: participationStatuses = (Array.isArray(statuses) && statuses.length > 0)
    ? statuses.map(s => s.name)
    : ['Signed Up','Confirmed','Tentative','Absent']
  
  // Server list is inferred from the selected character; no explicit server dropdown needed
  
  // Reactive initialization guard (prevents form reset on every reactive tick)
  $: if (show) {
    const key = editingEvent?.id ?? '__create__'
    if (initializedForKey !== key) {
      if (editingEvent) {
        populateForm()
      } else {
        resetForm()
      }
      initializedForKey = key
      // focus first input shortly after mount
      setTimeout(() => { if (nameInputEl) nameInputEl.focus() }, 0)
    }
  }
  
  // Reset init guard when modal closes
  $: if (!show) {
    initializedForKey = null
    submitting = false
  }
  
  function populateForm() {
    if (!editingEvent) return
    
    formData = {
      name: editingEvent.name || '',
      description: editingEvent.description || '',
      event_type: editingEvent.event_type || 'Custom',
      server_name: editingEvent.server_name || '',
      event_time: editingEvent.event_time ? formatDateTimeLocal(editingEvent.event_time) : '',
      character_id: editingEvent.character_id || null,
      participation_status: editingEvent.participation_status || 'Signed Up',
      location: editingEvent.location || '',
      recurring_pattern: editingEvent.recurring_pattern || null,
      notification_enabled: editingEvent.notification_enabled !== false,
      notification_minutes: editingEvent.notification_minutes || 30,
      timezone: editingEvent.timezone || ''
    }
    isValid = true
    timeMode = 'local'
  }
  
  function resetForm() {
    formData = {
      name: '',
      description: '',
      event_type: 'Custom',
      server_name: characters.length > 0 ? characters[0].server_name : '',
      event_time: '',
      character_id: characters.length > 0 ? characters[0].id : null,
      participation_status: 'Signed Up',
      location: '',
      recurring_pattern: null,
      notification_enabled: true,
      notification_minutes: 30,
      timezone: characters.length > 0 ? characters[0].server_timezone : Intl.DateTimeFormat().resolvedOptions().timeZone
    }
    errors = {}
    isValid = true
    timeMode = 'local'
  }

  // Load templates when shown
  import api from '../services/api.js'
  async function reloadTemplates(){
    try { templates = await api.getEventTemplates() } catch (_) { templates = [] }
  }
  $: if (show) { (async ()=>{ await reloadTemplates() })() }

  // Auto-apply initial template if provided on first show
  let appliedInitial = false
  $: if (show && initialTemplateId && !appliedInitial) {
    (async () => {
      try {
        await reloadTemplates()
        const exists = (templates || []).find(t => t.id == initialTemplateId)
        if (exists) {
          applyTemplate(initialTemplateId)
          appliedInitial = true
        }
      } catch (_) {}
    })()
  }

  // Reset template auto-apply flag when modal closes
  $: if (!show) {
    appliedInitial = false
    selectedTemplateId = ''
  }

  function applyTemplate(templateId) {
    const tpl = templates.find(t => t.id == templateId)
    if (!tpl) return
    selectedTemplateId = templateId
    // Prefer payload_json if present to mirror EventModal fields exactly
    const payload = typeof tpl.payload_json === 'string' ? JSON.parse(tpl.payload_json) : (tpl.payload_json || {})
    const source = Object.keys(payload).length > 0 ? payload : tpl
    formData = {
      ...formData,
      name: source.name ?? formData.name,
      description: source.description ?? formData.description,
      event_type: source.event_type ?? formData.event_type,
      server_name: source.server_name ?? formData.server_name,
      event_time: source.event_time ?? formData.event_time,
      character_id: source.character_id ?? formData.character_id,
      participation_status: source.participation_status ?? formData.participation_status,
      location: source.location ?? formData.location,
      notification_enabled: source.notification_enabled !== undefined ? !!source.notification_enabled : formData.notification_enabled,
      notification_minutes: typeof source.notification_minutes === 'number' ? source.notification_minutes : formData.notification_minutes,
      timezone: formData.timezone
    }

    // Compute event_time from timing strategy if provided in payload
    if (source.time_strategy) {
      const computedLocal = computeFromTimingStrategy(source.time_strategy, source.time_params || {})
      if (computedLocal) {
        formData.event_time = computedLocal
      }
    }

    // Ensure server fields reflect selected character if provided by template
    syncServerFromCharacter()
  }

  function computeFromTimingStrategy(strategy, params) {
    const now = new Date()
    function toLocalInputString(d) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `${y}-${m}-${day}T${hh}:${mm}`
    }
    if (strategy === 'relative') {
      const unit = params.unit || 'hour'
      const copy = new Date(now)
      if (unit === 'hour') copy.setHours(copy.getHours() + 1)
      else if (unit === 'day') copy.setDate(copy.getDate() + 1)
      else if (unit === 'week') copy.setDate(copy.getDate() + 7)
      return toLocalInputString(copy)
    }
    if (strategy === 'fixed') {
      const when = params.when || 'today'
      const timeOfDay = params.timeOfDay || '20:00'
      const [hh, mm] = timeOfDay.split(':').map(x => parseInt(x))
      const copy = new Date(now)
      if (when === 'tomorrow') {
        copy.setDate(copy.getDate() + 1)
      } else if (when === 'weekday') {
        const target = parseInt(params.weekday || 0)
        const delta = ((target - copy.getDay() + 7) % 7) || 7
        copy.setDate(copy.getDate() + delta)
      }
      copy.setHours(hh || 0, mm || 0, 0, 0)
      return toLocalInputString(copy)
    }
    return ''
  }

  // Legacy template time helpers removed; templates now compute via computeFromTimingStrategy only
  
  function formatDateTimeLocal(dateString) {
    if (!dateString) return ''
    
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }
  
  function validateForm() {
    errors = {}
    
    // Required fields
    if (!formData.name.trim()) {
      errors.name = 'Event name is required'
    }
    
    if (!formData.event_type) {
      errors.event_type = 'Event type is required'
    }
    
    if (!formData.event_time) {
      errors.event_time = 'Event time is required'
    }
    
    if (!formData.character_id) {
      errors.character_id = 'Character selection is required'
    }
    
    // Note: allow editing past events; only require presence
    
    // Validate notification minutes
    if (formData.notification_enabled && formData.notification_minutes < 0) {
      errors.notification_minutes = 'Notification minutes must be positive'
    }
    
    isValid = Object.keys(errors).length === 0
    return isValid
  }
  
  function handleSubmit() {
    if (submitting) return
    if (!validateForm()) {
      return
    }
    
    // Determine timezone based on mode
    let effectiveTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timeMode === 'server') {
      // Use selected character's server timezone
      const character = characters.find(c => c.id === parseInt(formData.character_id))
      effectiveTimezone = character?.server_timezone || formData.timezone || effectiveTimezone
    } else {
      effectiveTimezone = formData.timezone || effectiveTimezone
    }

    // Compute UTC ISO based on selected mode
    const eventTimeIso = timeMode === 'server'
      ? zonedTimeToUtc(formData.event_time, effectiveTimezone).toISOString()
      : new Date(formData.event_time).toISOString()

    // Ensure server fields are synced right before submit
    syncServerFromCharacter()

    // Format event data for submission
    const eventData = {
      ...formData,
      event_time: eventTimeIso,
      timezone: effectiveTimezone
    }
    
    submitting = true
    dispatch('save', eventData)
  }
  
  function handleCancel() {
    initializedForKey = null
    dispatch('cancel')
  }
  
  async function handleDelete() {
    if (editingEvent && editingEvent.id) {
      const { showConfirm } = await import('../stores/dialog.js')
      const ok = await showConfirm('Are you sure you want to delete this event?', 'Delete Event', 'Delete', 'Cancel')
      if (ok) {
        initializedForKey = null
        dispatch('delete', editingEvent.id)
      }
    }
  }
  
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      handleCancel()
    }
  }
  
  // Prevent accidental close on selection-drag outside: require mousedown+click on backdrop
  let backdropMouseDownOnSelf = false
  function onBackdropMouseDown(e) { backdropMouseDownOnSelf = e.target === e.currentTarget }
  function handleBackdropClick(event) {
    if (event.target === event.currentTarget && backdropMouseDownOnSelf) {
      handleCancel()
    }
  }
  
  // Ensure server_name/timezone reflect the selected character
  function syncServerFromCharacter() {
    if (!formData?.character_id) return
    const character = characters.find(c => c.id === parseInt(formData.character_id))
    if (character) {
      formData.server_name = character.server_name
      formData.timezone = character.server_timezone || formData.timezone
    }
  }

  // Auto-populate server name when character changes
  function handleCharacterChange() {
    syncServerFromCharacter()
  }
  
  // Get event type specific defaults
  function handleEventTypeChange() {
    const eventTypeDefaults = {
      'War': {
        location: 'Territory',
        notification_minutes: 60
      },
      'Invasion': {
        location: 'Territory',
        notification_minutes: 60
      },
      'Company Event': {
        location: 'Company Hall',
        notification_minutes: 30
      },
      'PvE': {
        location: 'Dungeon',
        notification_minutes: 15
      },
      'PvP': {
        location: 'Arena/OPR',
        notification_minutes: 15
      },
      
    }
    
    const defaults = eventTypeDefaults[formData.event_type]
    if (defaults) {
      if (!formData.location) {
        formData.location = defaults.location
      }
      formData.notification_minutes = defaults.notification_minutes
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" on:mousedown={onBackdropMouseDown} on:click={handleBackdropClick} on:keydown={handleKeydown}>
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" role="document" on:click|stopPropagation on:keydown|stopPropagation>
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
          {isCreating ? 'Create New Event' : 'Edit Event'}
        </h2>
        <button
          on:click={handleCancel}
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <!-- Form -->
      <form id="eventForm" on:submit|preventDefault={handleSubmit} class="p-6 space-y-6">
        <!-- Event Name -->
        <div>
          <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Event Name *
          </label>
          <input
            type="text"
            id="name"
            bind:this={nameInputEl}
            bind:value={formData.name}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="Enter event name"
            class:border-red-500={errors.name}
            required
          />
          {#if errors.name}
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
          {/if}
        </div>
        
        <!-- Template Apply + Event Type -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label for="event_type" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Event Type *
            </label>
            {#if templates.length > 0}
            <div class="flex items-center gap-2">
              <label for="apply_template" class="text-xs text-gray-600 dark:text-gray-400">Apply Template</label>
              <select id="apply_template" bind:value={selectedTemplateId} on:focus={reloadTemplates} on:click={reloadTemplates} on:change={(e)=> applyTemplate(e.target.value)} class="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                <option value="">Select</option>
                {#each templates as t}
                  <option value={t.id}>{t.name}</option>
                {/each}
              </select>
            </div>
            {/if}
          </div>
          <select
            id="event_type"
            bind:value={formData.event_type}
            on:change={handleEventTypeChange}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
            class:border-red-500={errors.event_type}
            required
          >
            {#each eventTypes as eventType}
              <option value={eventType}>{eventType}</option>
            {/each}
          </select>
          {#if errors.event_type}
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.event_type}</p>
          {/if}
        </div>
        
        <!-- Character (server inferred) -->
        <div>
            <label for="character_id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Character *
            </label>
            <select
              id="character_id"
              bind:value={formData.character_id}
              on:change={handleCharacterChange}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
              class:border-red-500={errors.character_id}
              required
            >
              <option value="">Select character</option>
              {#each characters as character}
                <option value={character.id}>{character.name} ({character.server_name})</option>
              {/each}
            </select>
            {#if errors.character_id}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.character_id}</p>
            {/if}
        </div>
        
        <!-- Event Time and Participation Status -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div class="flex items-center justify-between mb-2">
              <label for="event_time" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Event Time *
              </label>
              <div class="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
                <button type="button" class={`px-3 py-1 text-xs ${timeMode === 'local' ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`} on:click={() => timeMode = 'local'} aria-pressed={timeMode === 'local'}>
                  Local Time
                </button>
                <button type="button" class={`px-3 py-1 text-xs border-l border-gray-300 dark:border-gray-600 ${timeMode === 'server' ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`} on:click={() => timeMode = 'server'} aria-pressed={timeMode === 'server'}>
                  Server Time
                </button>
              </div>
            </div>
            <input
              type="datetime-local"
              id="event_time"
              bind:value={formData.event_time}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
              class:border-red-500={errors.event_time}
              required
            />
            <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {#if timeMode === 'server'}
                Using server timezone from character: {characters.find(c => c.id === parseInt(formData.character_id))?.server_timezone || formData.timezone}
              {:else}
                Using your local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
              {/if}
            </div>
            {#if errors.event_time}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.event_time}</p>
            {/if}
          </div>
          
          <div>
            <label for="modal_participation_status" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Participation Status</label>
            <StatusSelect
              id="modal_participation_status"
              value={formData.participation_status}
              statuses={Array.isArray(statuses) && statuses.length ? statuses : participationStatuses.map(n => ({ name: n }))}
              selectClass="w-full"
              on:change={(e)=> formData.participation_status = e.detail.value}
            />
          </div>
        </div>
        
        <!-- Location -->
        <div>
          <label for="location" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Location
          </label>
          <input
            type="text"
            id="location"
            bind:value={formData.location}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="Enter location"
          />
        </div>
        
        <!-- Description -->
        <div>
          <label for="description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description
          </label>
          <textarea
            id="description"
            bind:value={formData.description}
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="Enter event description"
          ></textarea>
        </div>
        
        <!-- Notifications -->
        <div class="space-y-4">
          <div class="flex items-center">
            <input
              type="checkbox"
              id="notification_enabled"
              bind:checked={formData.notification_enabled}
              class="w-4 h-4 text-nw-blue bg-gray-100 border-gray-300 rounded focus:ring-nw-blue focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label for="notification_enabled" class="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Enable notifications
            </label>
          </div>
          
          {#if formData.notification_enabled}
            <div>
              <label for="notification_minutes" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notify me (minutes before event)
              </label>
              <input
                type="number"
                id="notification_minutes"
                bind:value={formData.notification_minutes}
                min="0"
                max="1440"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
                class:border-red-500={errors.notification_minutes}
              />
              {#if errors.notification_minutes}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.notification_minutes}</p>
              {/if}
            </div>
          {/if}
        </div>
      </form>
      
      <!-- Footer -->
      <div class="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
        <div>
          {#if !isCreating}
            <button
              type="button"
              on:click={handleDelete}
              class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Delete Event
            </button>
          {/if}
        </div>
        
        <div class="flex items-center space-x-3">
          <button
            type="button"
            on:click={handleCancel}
            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-nw-blue focus:ring-offset-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="eventForm"
            class="px-4 py-2 text-sm font-medium text-white bg-nw-blue rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-60"
            disabled={!isValid || submitting}
          >
            {isCreating ? 'Create Event' : 'Update Event'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Custom scrollbar for modal */
  .overflow-y-auto::-webkit-scrollbar {
    width: 8px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-track {
    background: #f1f1f1;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
</style> 