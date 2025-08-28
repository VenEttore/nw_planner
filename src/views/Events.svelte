<script>
  import { onMount } from 'svelte'
  import api from '../services/api.js'
  import EventModal from '../components/EventModal.svelte'
  import TemplateManager from '../components/TemplateManager.svelte'
  import { currentView } from '../stores/ui'
  
  let loading = true
  let events = []
  let characters = []
  let templates = []
  let filterType = 'all'
  let filterCharacter = 'all'
  let showModal = false
  let editingEvent = null
  let showTemplateManager = false
  let pendingTemplateId = null
  let now = new Date()
  let nowTimer = null
  
  onMount(async () => {
    await loadData()
    // Update `now` periodically so events auto-move to Past
    nowTimer = setInterval(() => { now = new Date() }, 30000)
  })
  
  // Cleanup timer
  import { onDestroy } from 'svelte'
  onDestroy(() => { if (nowTimer) clearInterval(nowTimer) })
  
  async function loadData() {
    loading = true
    try {
      // Load events and characters
      const [eventsData, charactersData, templatesData] = await Promise.all([
        api.getEvents(),
        api.getActiveCharacters(),
        api.getEventTemplates()
      ])
      
      events = eventsData
      characters = charactersData
      templates = templatesData
    } catch (error) {
      console.error('Error loading events data:', error)
    } finally {
      loading = false
    }
  }

  // Just-in-time refresh for template list used by the action bar selector
  async function reloadTemplatesList() {
    try { templates = await api.getEventTemplates() } catch { /* noop */ }
  }
  
  async function updateRsvpStatus(eventId, newStatus) {
    try {
      await api.updateEventRsvp(eventId, newStatus)
      // Reconcile with fresh row to avoid drift
      try { const fresh = await api.getEventById(eventId); if (fresh) events = (events || []).map(e => e.id === eventId ? fresh : e) } catch {}
    } catch (error) {
      console.error('Error updating RSVP:', error)
    }
  }
  
  async function deleteEvent(eventId) {
    const { showConfirm } = await import('../stores/dialog.js')
    const ok = await showConfirm('Are you sure you want to delete this event?', 'Delete Event', 'Delete', 'Cancel')
    if (!ok) return
    try {
      await api.deleteEvent(eventId)
      // Remove locally without reloading everything
      events = (events || []).filter(e => e.id !== eventId)
    } catch (error) {
      console.error('Error deleting event:', error)
    }
  }

  let initialTemplateId = null
  function openCreate(tplId = null) {
    editingEvent = null
    initialTemplateId = tplId
    showModal = true
  }
  function openEdit(ev) {
    editingEvent = ev
    showModal = true
  }
  async function handleSave(e) {
    const data = e.detail
    try {
      if (editingEvent) {
        const updated = await api.updateEvent(editingEvent.id, data)
        if (updated && updated.id) {
          events = (events || []).map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev)
        }
      } else {
        const created = await api.createEvent(data)
        if (created && created.id) {
          events = [...(events || []), created]
        }
      }
      showModal = false
      editingEvent = null
      pendingTemplateId = null
    } catch (err) {
      console.error('Error saving event:', err)
    }
  }
  
  // Filter events based on type and character
  $: filteredEvents = events.filter(event => {
    const typeMatch = filterType === 'all' || event.event_type === filterType
    const characterMatch = filterCharacter === 'all' || event.character_id == filterCharacter
    return typeMatch && characterMatch
  })
  
  // Split into upcoming vs past based on current time
  $: upcomingFiltered = filteredEvents
    .filter(e => new Date(e.event_time) > now)
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  $: pastFiltered = filteredEvents
    .filter(e => new Date(e.event_time) <= now)
    .sort((a, b) => new Date(b.event_time) - new Date(a.event_time))
  
  // Get unique event types for filter
  $: eventTypes = [...new Set(events.map(e => e.event_type))].filter(Boolean)
  
  function formatEventTime(eventTime) {
    const date = new Date(eventTime)
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
  }
  
  function getEventTypeColor(eventType) {
    const colors = {
      'War': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
      'Invasion': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200',
      'Company Event': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
      'Meeting': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
      'Custom': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-200'
    }
    return colors[eventType] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  }
</script>

<div class="max-w-7xl mx-auto">
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Events</h1>
    <p class="text-gray-600 dark:text-gray-400">Manage your scheduled events and activities.</p>
  </div>
  
  {#if loading}
    <div class="flex items-center justify-center h-64">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-nw-blue"></div>
    </div>
  {:else}
    {#if characters.length === 0}
    <div class="mb-4 rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-3">
      <p class="text-sm text-yellow-900 dark:text-yellow-200">
        You need at least one character before creating events. 
        <button class="underline text-nw-blue hover:text-nw-blue-dark" on:click={() => currentView.set('characters')}>
          Create your first character →
        </button>
      </p>
    </div>
    {/if}

    <!-- Action Bar -->
    <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
      <div class="flex space-x-2">
        <button class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed" disabled={characters.length === 0} title={characters.length===0 ? 'Create a character first' : ''} on:click={openCreate}>Add New Event</button>
        <div class="relative">
          <select class="btn-secondary text-sm px-3 py-2" on:focus={reloadTemplatesList} on:click={reloadTemplatesList} on:change={(e)=>{ const tplId = e.target.value; if (!tplId) return; pendingTemplateId = tplId; openCreate(); e.target.value=''; }}>
            <option value="">New from Template…</option>
            {#each templates as t}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
        </div>
        <button class="btn-secondary" on:click={()=>{ showTemplateManager=true }}>Manage Templates</button>
      </div>
      
      <!-- Filters -->
      <div class="flex space-x-3">
        <select bind:value={filterType} class="select-input text-sm">
          <option value="all">All Types</option>
          {#each eventTypes as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
        
        <select bind:value={filterCharacter} class="select-input text-sm">
          <option value="all">All Characters</option>
          {#each characters as character}
            <option value={character.id}>{character.name}</option>
          {/each}
        </select>
      </div>
    </div>
    
    <!-- Upcoming Events -->
    <div class="card mb-6">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Upcoming Events</h2>
      {#if upcomingFiltered.length > 0}
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
        {#each upcomingFiltered as event}
          {@const timeData = formatEventTime(event.event_time)}
          <div class="py-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1">
                <!-- Event Header -->
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="text-base font-semibold text-gray-900 dark:text-white">{event.name}</h3>
                  <span class="text-xs px-2 py-1 rounded-full {getEventTypeColor(event.event_type)}">
                    {event.event_type}
                  </span>
                </div>
                
                <!-- Event Details -->
                <div class="text-xs text-gray-600 dark:text-gray-400">
                  <div class="flex items-center gap-3">
                    <span>📅 {timeData.date} at {timeData.time}</span>
                    {#if event.server_name}
                      <span>🌐 {event.server_name}</span>
                    {/if}
                    {#if event.location}
                      <span>📍 {event.location}</span>
                    {/if}
                  </div>
                  
                  {#if event.description}
                    <div class="text-gray-500 dark:text-gray-400 italic mt-0.5">
                      {event.description}
                    </div>
                  {/if}
                </div>
              </div>
              
              <!-- Actions -->
              <div class="flex items-center gap-2 ml-2">
                <!-- RSVP Status Dropdown -->
                <select 
                  value={event.participation_status || 'Signed Up'}
                  on:change={(e) => updateRsvpStatus(event.id, e.target.value)}
                  class="text-xs pr-6 pl-2 py-1 rounded border appearance-none bg-[length:12px_12px] bg-no-repeat bg-right-2 bg-[url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 20 20\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 8 10 12 14 8\'/></svg>')] {
                    event.participation_status === 'Confirmed' ? 'bg-green-50 border-green-200 text-green-800' :
                    event.participation_status === 'Signed Up' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                    event.participation_status === 'Tentative' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                    'bg-gray-50 border-gray-200 text-gray-800'
                  }"
                >
                  <option value="Signed Up">Signed Up</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Tentative">Tentative</option>
                  <option value="Absent">Absent</option>
                </select>
                
                <!-- Action Buttons -->
                <div class="flex gap-1">
                  <button class="btn-secondary text-xs px-2 py-1" on:click={() => openEdit(event)}>Edit</button>
                  <button
                    class="btn-danger text-xs px-2 py-1"
                    on:click={() => deleteEvent(event.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/each}
        </div>
      {:else}
        <div class="text-sm text-gray-600 dark:text-gray-400">No upcoming events match your filters.</div>
      {/if}
    </div>
    
    <!-- Past Events -->
    <div class="card">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Past Events</h2>
      {#if pastFiltered.length > 0}
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each pastFiltered as event}
            {@const timeData = formatEventTime(event.event_time)}
            <div class="py-3 opacity-70">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="text-base font-semibold text-gray-900 dark:text-white">{event.name}</h3>
                    <span class="text-xs px-2 py-1 rounded-full {getEventTypeColor(event.event_type)}">
                      {event.event_type}
                    </span>
                  </div>
                  <div class="text-xs text-gray-600 dark:text-gray-400">
                    <div class="flex items-center gap-3">
                      <span>📅 {timeData.date} at {timeData.time}</span>
                      {#if event.server_name}
                        <span>🌐 {event.server_name}</span>
                      {/if}
                      {#if event.location}
                        <span>📍 {event.location}</span>
                      {/if}
                    </div>
                    {#if event.description}
                      <div class="text-gray-500 dark:text-gray-400 italic mt-0.5">{event.description}</div>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-2 ml-2">
                  <div class="flex gap-1">
                    <button class="btn-secondary text-xs" on:click={() => openEdit(event)}>Edit</button>
                    <button class="btn-danger text-xs" on:click={() => deleteEvent(event.id)}>Delete</button>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-sm text-gray-600 dark:text-gray-400">No past events.</div>
      {/if}
    </div>
  {/if}
  <EventModal show={showModal} editingEvent={editingEvent} characters={characters} isCreating={!editingEvent} initialTemplateId={pendingTemplateId} on:save={handleSave} on:cancel={() => { showModal = false; editingEvent = null; pendingTemplateId = null }} on:delete={async (e) => { try { await api.deleteEvent(e.detail); showModal = false; editingEvent = null; pendingTemplateId = null; await loadData() } catch (err) { console.error('Delete failed', err) } }} />
  <TemplateManager
    isOpen={showTemplateManager}
    on:close={()=>{ showTemplateManager=false }}
    on:changed={async ()=>{ try { templates = await api.getEventTemplates() } catch { /* noop */ } }}
    on:apply={(e)=>{ showTemplateManager=false; pendingTemplateId = e.detail.id; editingEvent=null; showModal=true }}
  />
</div> 