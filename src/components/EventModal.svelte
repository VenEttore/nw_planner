<script>
  import { createEventDispatcher } from 'svelte'
  import { format } from 'date-fns'
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
    timezone: '',
    war_role: 'Unspecified'
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
  let servers = []
  let association_mode = 'byCharacter' // 'byCharacter' | 'byServer' | 'none'
  $: canUseServerTime = (association_mode === 'byCharacter' && !!formData.character_id) || (association_mode === 'byServer' && !!formData.server_name)
  // War rules conflicts
  let warConflicts = { caps: [], steamDupes: [], overlaps: [], summaries: { caps: 'none', steamDupes: 'none', overlaps: 'none' } }
  let checkingConflicts = false
  let warningsOpen = false
  let warnBtnEl
  let popoverPos = { top: 0, left: 0 }
  const POPOVER_WIDTH_PX = 320 // matches w-80 (20rem)
  
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
      timezone: editingEvent.timezone || '',
      war_role: (editingEvent.war_type || editingEvent.war_role || 'Unspecified')
    }
    if (formData.character_id) association_mode = 'byCharacter'
    else if (formData.server_name) association_mode = 'byServer'
    else association_mode = 'none'
    isValid = true
    timeMode = 'local'
  }
  
  function resetForm() {
    formData = {
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
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      war_role: 'Unspecified'
    }
    errors = {}
    isValid = true
    timeMode = 'local'
    association_mode = characters.length > 0 ? 'byCharacter' : 'none'
  }

  // Load templates when shown
  import api from '../services/api.js'
  import CharacterSelect from './CharacterSelect.svelte'
  async function reloadTemplates(){
    try { templates = await api.getEventTemplates() } catch (_) { templates = [] }
  }
  $: if (show) { (async ()=>{ await reloadTemplates() })() }

  // Load servers when shown
  async function loadServers(){
    try { servers = await api.getActiveServers() } catch (_) { servers = [] }
    // Ensure current event's server appears even if inactive or not in active list
    try {
      const current = formData?.server_name || editingEvent?.server_name
      if (current && !servers.some(s => s.name === current)) {
        servers = [...servers, { name: current, region: 'Unknown', timezone: formData?.timezone || editingEvent?.timezone || '' }]
      }
    } catch {}
  }
  $: if (show) { (async ()=>{ await loadServers() })() }

  // Debounced conflict check
  let conflictTimer
  function scheduleConflictCheck() {
    if (!show) return
    if (conflictTimer) clearTimeout(conflictTimer)
    conflictTimer = setTimeout(runConflictCheck, 200)
  }
  async function runConflictCheck() {
    if (!show) return
    if (formData.event_type !== 'War') { warConflicts = { caps: [], steamDupes: [], overlaps: [], summaries: { caps: 'none', steamDupes: 'none', overlaps: 'none' } }; return }
    if (!formData.event_time) { warConflicts = { caps: [], steamDupes: [], overlaps: [], summaries: { caps: 'none', steamDupes: 'none', overlaps: 'none' } }; return }
    checkingConflicts = true
    try {
      // Determine effective timezone like submit does
      let effectiveTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (timeMode === 'server') {
        if (association_mode === 'byCharacter') {
          const character = characters.find(c => c.id === parseInt(formData.character_id))
          effectiveTimezone = character?.server_timezone || formData.timezone || effectiveTimezone
        } else if (association_mode === 'byServer') {
          const server = servers.find(s => s.name === formData.server_name)
          effectiveTimezone = server?.timezone || formData.timezone || effectiveTimezone
        }
      } else {
        effectiveTimezone = formData.timezone || effectiveTimezone
      }
      const dto = {
        id: editingEvent?.id,
        event_type: 'War',
        war_type: formData.war_role,
        character_id: association_mode === 'byCharacter' ? (formData.character_id ? parseInt(formData.character_id) : null) : null,
        server_name: association_mode === 'byServer' ? (formData.server_name || '') : (characters.find(c => c.id === parseInt(formData.character_id))?.server_name || formData.server_name || ''),
        event_time: timeMode === 'server' ? new Date(zonedTimeToUtc(formData.event_time, effectiveTimezone)).toISOString() : new Date(formData.event_time).toISOString(),
        timezone: effectiveTimezone,
        participation_status: formData.participation_status
      }
      warConflicts = await api.getWarConflictsForEvent(dto)
    } catch (e) {
      console.error('War conflict check failed:', e)
      warConflicts = { caps: [], steamDupes: [], overlaps: [], summaries: { caps: 'none', steamDupes: 'none', overlaps: 'none' } }
    } finally {
      checkingConflicts = false
    }
  }

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
      timezone: formData.timezone,
      war_role: (source.war_role ?? source.war_type ?? formData.war_role ?? 'Unspecified')
    }
    // Derive association after template apply, respecting explicit template hint
    const assoc = source.association_mode
    if (assoc === 'byCharacter') {
      association_mode = 'byCharacter'
      // Ensure server_name mirrors character if present
      syncServerFromCharacter()
    } else if (assoc === 'byServer') {
      association_mode = 'byServer'
      // Ensure timezone mirrors selected server if present
      const s = servers.find(x => x.name === formData.server_name)
      if (s) formData.timezone = s.timezone || formData.timezone
      // Clear character to avoid mixed association
      formData.character_id = null
    } else {
      // Fallback: infer from populated fields
      if (formData.character_id) { association_mode = 'byCharacter'; syncServerFromCharacter() }
      else if (formData.server_name) { association_mode = 'byServer'; const s = servers.find(x => x.name === formData.server_name); if (s) formData.timezone = s.timezone || formData.timezone }
      else { association_mode = 'none' }
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
    
    if (association_mode === 'byCharacter') {
    if (!formData.character_id) {
      errors.character_id = 'Character selection is required'
    }
    } else if (association_mode === 'byServer') {
      if (!formData.server_name) {
        errors.server_name = 'Server selection is required'
      }
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
    
    // Determine timezone based on mode and association
    let effectiveTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timeMode === 'server') {
      if (association_mode === 'byCharacter') {
        const character = characters.find(c => c.id === parseInt(formData.character_id))
        effectiveTimezone = character?.server_timezone || formData.timezone || effectiveTimezone
      } else if (association_mode === 'byServer') {
        const server = servers.find(s => s.name === formData.server_name)
        effectiveTimezone = server?.timezone || formData.timezone || effectiveTimezone
      }
    } else {
      effectiveTimezone = formData.timezone || effectiveTimezone
    }

    // Compute UTC ISO based on selected mode
    const eventTimeIso = timeMode === 'server'
      ? zonedTimeToUtc(formData.event_time, effectiveTimezone).toISOString()
      : new Date(formData.event_time).toISOString()

    // Ensure server fields reflect association right before submit
    if (association_mode === 'byCharacter') {
      syncServerFromCharacter()
    } else if (association_mode === 'byServer') {
      const server = servers.find(s => s.name === formData.server_name)
      if (server) {
        formData.server_name = server.name
        formData.timezone = server.timezone || formData.timezone
      } else if (formData.server_name && !formData.timezone) {
        // Resolve timezone from servers list if available
        const resolvedTz = (servers.find(s => s.name === formData.server_name) || {}).timezone
        if (resolvedTz) formData.timezone = resolvedTz
      }
      formData.character_id = null
    } else {
      formData.character_id = null
      formData.server_name = ''
    }
    
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
    if (association_mode !== 'byCharacter') return
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
    scheduleConflictCheck()
  }

  function handleServerChange(e) {
    const name = e?.target?.value || formData.server_name
    const server = servers.find(s => s.name === name)
    if (server) {
      formData.server_name = server.name
      formData.timezone = server.timezone || formData.timezone
    }
    scheduleConflictCheck()
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

  // Watch inputs to re-check conflicts
  $: if (show) {
    // key fields that impact conflicts
    const keyTuple = [formData.event_type, formData.war_role, formData.character_id, formData.server_name, formData.event_time, timeMode, association_mode, formData.participation_status]
    keyTuple, scheduleConflictCheck()
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
        
        <!-- Template Apply + Event Type / War Type -->
        <div>
          <div class="flex items-center justify-between mb-2">
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
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
              <label for="event_type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Event Type *</label>
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
            {#if formData.event_type === 'War'}
            <div>
              <label for="war_type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">War Type</label>
              <select
                id="war_type"
                bind:value={formData.war_role}
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="Unspecified">Unspecified</option>
                <option value="Attack">Attack</option>
                <option value="Defense">Defense</option>
              </select>
            </div>
            {/if}
          </div>
        </div>
        
        <!-- Association + Character/Server selection -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
            <label for="assoc_mode" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Association</label>
            <select
              id="assoc_mode"
              bind:value={association_mode}
              on:change={(e)=>{
                if (association_mode === 'byCharacter') {
                  if (!formData.character_id && characters.length>0) { formData.character_id = characters[0].id; syncServerFromCharacter() }
                } else if (association_mode === 'byServer') {
                  formData.character_id = null
                  if (!formData.server_name && servers.length>0) { formData.server_name = servers[0].name; handleServerChange({ target: { value: formData.server_name }}) }
                } else {
                  formData.character_id = null
                  formData.server_name = ''
                }
              }}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
            >
              <option value="byCharacter">By Character</option>
              <option value="byServer">By Server</option>
              <option value="none">None</option>
            </select>
          </div>
          {#if association_mode === 'byCharacter'}
          <div class="md:col-span-2">
            <label for="character_id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Character *</label>
            <div class="w-full">
              <CharacterSelect characters={characters} bind:value={formData.character_id} placeholder="Select character" on:change={handleCharacterChange} />
            </div>
            {#if errors.character_id}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.character_id}</p>
            {/if}
        </div>

        {#if formData.event_type === 'War'}
        <!-- War rules warnings popover -->
        <div class="relative z-[1100]">
          <button bind:this={warnBtnEl} type="button" class="text-xs px-2 py-1 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 relative"
            on:click={() => {
              warningsOpen = !warningsOpen
              if (warningsOpen && warnBtnEl) {
                const rect = warnBtnEl.getBoundingClientRect()
                let left = Math.min(Math.max(8, rect.left), (window.innerWidth - POPOVER_WIDTH_PX - 8))
                let top = rect.bottom + 8
                popoverPos = { top, left }
              }
            }}
          >
            War Conflicts
            {#if (association_mode === 'byServer' && !formData.character_id) || warConflicts.summaries.caps !== 'none' || warConflicts.summaries.overlaps !== 'none' || warConflicts.summaries.steamDupes !== 'none'}
              <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500"></span>
            {/if}
          </button>
          {#if warningsOpen}
            <div class="fixed w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-3 space-y-2" style={`top:${popoverPos.top}px;left:${popoverPos.left}px`}>
              {#if checkingConflicts}
                <div class="text-xs text-gray-500">Checking war rules…</div>
              {/if}
              {#if association_mode === 'byServer' && !formData.character_id}
                <div class="text-xs text-amber-700">Server-only: after selecting a character, verify daily limits (1 Attack + 1 Defense) and pre-slots for same-Steam same-server same-type.</div>
              {/if}
              {#if (warConflicts.summaries.caps === 'hard')}
                <div class="text-sm text-red-700">Daily cap reached: this character already has a {formData.war_role} on this war day.</div>
              {/if}
              {#if (warConflicts.summaries.caps === 'soft')}
                <div class="text-sm text-amber-700">Daily cap warning: one Confirmed and at least one other non-absent {formData.war_role} on this war day.</div>
              {/if}
              {#if warConflicts.steamDupes.length > 0}
                <div class="text-sm text-amber-700">Same Steam, same server, same war type detected across characters. Pre-slotting is required in-game.</div>
              {/if}
              {#if warConflicts.summaries.overlaps === 'soft'}
                <div class="text-sm text-amber-700">Time overlap: one Confirmed war conflicts with another non-absent war.</div>
              {:else if warConflicts.summaries.overlaps === 'hard'}
                <div class="text-sm text-red-700">Time overlap: two or more Confirmed wars conflict in time.</div>
              {/if}
              {#if (warConflicts.summaries.caps !== 'hard') && warConflicts.steamDupes.length === 0 && warConflicts.summaries.overlaps === 'none' && !(association_mode === 'byServer' && !formData.character_id)}
                <div class="text-xs text-gray-600 dark:text-gray-300">No issues detected.</div>
              {/if}
            </div>
          {/if}
        </div>
        {/if}
          {:else if association_mode === 'byServer'}
          <div class="md:col-span-2">
            <label for="server_name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Server *</label>
            <select
              id="server_name"
              bind:value={formData.server_name}
              on:change={handleServerChange}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
              class:border-red-500={errors.server_name}
              required
            >
              <option value="">Select server</option>
              {#each servers as s}
                <option value={s.name}>{s.name} ({s.region})</option>
              {/each}
            </select>
            {#if errors.server_name}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.server_name}</p>
            {/if}
          </div>
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
                <button type="button" class={`px-3 py-1 text-xs border-l border-gray-300 dark:border-gray-600 ${timeMode === 'server' ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'} ${!canUseServerTime ? 'opacity-50 cursor-not-allowed' : ''}`} on:click={() => { if (canUseServerTime) timeMode = 'server' }} aria-pressed={timeMode === 'server'} disabled={!canUseServerTime}>
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
                {#if association_mode === 'byCharacter'}
                  Using server timezone from character: {characters.find(c => c.id === parseInt(formData.character_id))?.server_timezone || formData.timezone}
                {:else if association_mode === 'byServer'}
                  Using selected server timezone: {servers.find(s => s.name === formData.server_name)?.timezone || formData.timezone}
                {:else}
                  Server time requires a character or server association.
                {/if}
              {:else}
                Using your local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
              {/if}
            </div>
            {#if errors.event_time}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.event_time}</p>
            {/if}
          </div>
          
          <div>
            <label for="participation_status" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Participation Status
            </label>
            <select
              id="participation_status"
              bind:value={formData.participation_status}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-nw-blue focus:border-transparent dark:bg-gray-700 dark:text-white"
            >
              {#each participationStatuses as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
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