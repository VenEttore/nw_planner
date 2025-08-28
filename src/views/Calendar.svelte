<script>
  import { onMount, onDestroy } from 'svelte'
  import { Calendar } from '@fullcalendar/core'
  import dayGridPlugin from '@fullcalendar/daygrid'
  import timeGridPlugin from '@fullcalendar/timegrid'
  import interactionPlugin from '@fullcalendar/interaction'
  import api from '../services/api.js'
  import { selectedCharacters } from '../stores/ui.js'
  import EventModal from '../components/EventModal.svelte'
  
  let calendarEl
  let calendar
  let loading = true
  let events = []
  let characters = []
  let statuses = []
  let selectedCharacterIds = []
  let characterSearch = ''
  let showAll = true
  let calendarView = 'dayGridMonth'
  let currentDate = new Date()
  let showEventModal = false
  let editingEvent = null
  let isCreating = false
  
  // Calendar configuration
  let calendarConfig = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    height: 'auto',
    selectable: true,
    selectMirror: true,
    editable: true,
    eventResizableFromStart: true,
    eventDurationEditable: true,
    eventStartEditable: true,
    dayMaxEvents: true,
    weekends: true,
    events: [],
    eventClick: handleEventClick,
    select: handleDateSelect,
    eventDrop: handleEventDrop,
    eventResize: handleEventResize,
    eventDidMount: handleEventDidMount,
    themeSystem: 'standard',
    eventClassNames: 'cursor-pointer',
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      meridiem: 'short'
    }
  }
  
  onMount(async () => {
    await loadData()
    initializeCalendar()
    
    // Subscribe to character selection changes
    const unsubscribe = selectedCharacters.subscribe(value => {
      selectedCharacterIds = value
      refreshCalendarEvents()
    })
    
    return unsubscribe
  })
  
  onDestroy(() => {
    if (calendar) {
      calendar.destroy()
    }
  })
  
  async function loadData() {
    loading = true
    try {
      const [eventsData, charactersData, statusData] = await Promise.all([
        api.getEvents(),
        api.getActiveCharacters(),
        api.getParticipationStatuses()
      ])
      
      events = eventsData
      characters = charactersData
      statuses = Array.isArray(statusData) ? statusData : []
      
      // Set default to "All"
      if (selectedCharacterIds.length === 0 && characters.length > 0) {
        selectedCharacterIds = characters.map(c => c.id)
        selectedCharacters.set(selectedCharacterIds)
      }
    } catch (error) {
      console.error('Error loading calendar data:', error)
    } finally {
      loading = false
    }
  }
  
  function initializeCalendar() {
    if (!calendarEl) return
    
    calendar = new Calendar(calendarEl, calendarConfig)
    calendar.render()
    
    // Load events after calendar is rendered
    refreshCalendarEvents()
  }
  
  async function refreshCalendarEvents() {
    if (!calendar) return
    
    try {
      // Get date range for current view
      const view = calendar.view
      const start = view.activeStart
      const end = view.activeEnd
      
      // Get events for the current date range
      const calendarEvents = await api.getEventsForCalendar(
        start.toISOString(),
        end.toISOString()
      )
      
      // Filter events by selected characters (or show all)
      const allowed = new Set(selectedCharacterIds)
      const filteredEvents = calendarEvents.filter(event => allowed.has(event.character_id))
      
      // Format events for FullCalendar
      const formattedEvents = filteredEvents.map(event => ({
        id: event.id,
        title: event.name,
        start: event.event_time,
        description: event.description,
        extendedProps: {
          type: event.event_type,
          server: event.server_name,
          character: event.character_name,
          characterId: event.character_id,
          status: event.participation_status,
          location: event.location,
          originalEvent: event
        },
        backgroundColor: getEventColor(event.event_type, event.participation_status),
        borderColor: getEventBorderColor(event.event_type),
        textColor: getEventTextColor(event.event_type, event.participation_status),
        className: getEventClassName(event.event_type, event.participation_status)
      }))
      
      // Add daily and weekly reset markers
      const resetMarkers = generateResetMarkers(start, end)
      formattedEvents.push(...resetMarkers)
      
      // Update calendar events
      calendar.removeAllEvents()
      calendar.addEventSource(formattedEvents)
      
    } catch (error) {
      console.error('Error refreshing calendar events:', error)
    }
  }
  
  function generateResetMarkers(start, end) {
    const markers = []
    const current = new Date(start)
    
    while (current <= end) {
      // Add daily reset markers (5 AM each day)
      const dailyReset = new Date(current)
      dailyReset.setHours(5, 0, 0, 0)
      
      if (dailyReset >= start && dailyReset <= end) {
        markers.push({
          id: `daily-reset-${dailyReset.getTime()}`,
          title: '🔄 Daily Reset',
          start: dailyReset,
          allDay: false,
          display: 'background',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderColor: 'rgba(59, 130, 246, 0.3)',
          className: 'reset-marker daily-reset'
        })
      }
      
      // Add weekly reset markers (Tuesday 5 AM)
      if (current.getDay() === 2) { // Tuesday
        const weeklyReset = new Date(current)
        weeklyReset.setHours(5, 0, 0, 0)
        
        if (weeklyReset >= start && weeklyReset <= end) {
          markers.push({
            id: `weekly-reset-${weeklyReset.getTime()}`,
            title: '🔄 Weekly Reset',
            start: weeklyReset,
            allDay: false,
            display: 'background',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            borderColor: 'rgba(249, 115, 22, 0.3)',
            className: 'reset-marker weekly-reset'
          })
        }
      }
      
      current.setDate(current.getDate() + 1)
    }
    
    return markers
  }
  
  function getEventColor(eventType, status) {
    const colors = {
      'War': '#ef4444',
      'Invasion': '#f97316',
      'Company Event': '#8b5cf6',
      'PvE': '#06b6d4',
      'PvP': '#dc2626',
      'Custom': '#6b7280'
    }
    
    const baseColor = colors[eventType] || colors['Custom']
    
    // Adjust opacity based on participation status
    const statusOpacity = {
      'Confirmed': '1',
      'Signed Up': '0.8',
      'Tentative': '0.6',
      'Absent': '0.3'
    }
    
    return baseColor + Math.floor(255 * parseFloat(statusOpacity[status] || '0.8')).toString(16).padStart(2, '0')
  }
  
  function getEventBorderColor(eventType) {
    const colors = {
      'War': '#b91c1c',
      'Invasion': '#c2410c',
      'Company Event': '#7c3aed',
      'PvE': '#0891b2',
      'PvP': '#991b1b',
      'Custom': '#4b5563'
    }
    
    return colors[eventType] || colors['Custom']
  }
  
  function getEventTextColor(eventType, status) {
    return '#ffffff'
  }
  
  function getEventClassName(eventType, status) {
    return `event-${eventType.toLowerCase().replace(/\s+/g, '-')} status-${status.toLowerCase().replace(/\s+/g, '-')}`
  }
  
  async function handleEventClick(info) {
    const event = info.event
    
    // Don't edit reset markers
    if (event.id.includes('reset')) return
    
    try {
      const fresh = await api.getEventById(event.id)
      editingEvent = fresh || event.extendedProps.originalEvent
    } catch {
      editingEvent = event.extendedProps.originalEvent
    }
    isCreating = false
    showEventModal = true
  }
  
  function handleDateSelect(info) {
    // Create new event at selected date/time
    editingEvent = {
      name: '',
      description: '',
      event_type: 'Custom',
      server_name: characters.find(c => selectedCharacterIds.includes(c.id))?.server_name || '',
      event_time: info.start.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      character_id: selectedCharacterIds[0] || null,
      participation_status: 'Signed Up',
      location: '',
      recurring_pattern: null,
      notification_enabled: true,
      notification_minutes: 30
    }
    
    isCreating = true
    showEventModal = true
    
    // Clear the selection
    calendar.unselect()
  }
  
  async function handleEventDrop(info) {
    const eventId = info.event.id
    const newStart = info.event.start
    
    // Don't allow moving reset markers
    if (eventId.includes('reset')) {
      info.revert()
      return
    }
    
    try {
      const originalEvent = info.event.extendedProps.originalEvent
      await api.updateEvent(eventId, {
        ...originalEvent,
        event_time: newStart.toISOString()
      })
      
      // Refresh to get updated data
      await refreshCalendarEvents()
    } catch (error) {
      console.error('Error updating event:', error)
      info.revert()
    }
  }
  
  async function handleEventResize(info) {
    // Note: This would be for events with duration
    // For now, we'll just refresh the calendar
    await refreshCalendarEvents()
  }
  
  function handleEventDidMount(info) {
    const event = info.event
    
    // Add tooltips for events
    const title = `${event.title}\n${event.extendedProps.description || ''}\nServer: ${event.extendedProps.server || 'Unknown'}\nStatus: ${event.extendedProps.status || 'Unknown'}`
    info.el.setAttribute('title', title)
  }
  
  async function handleEventSave(eventData) {
    try {
      if (isCreating) {
        await api.createEvent(eventData)
      } else {
        await api.updateEvent(editingEvent.id, eventData)
      }
      
      await refreshCalendarEvents()
      // Reset modal state after a tick so the modal can close cleanly and not reuse old form state
      queueMicrotask(() => {
        showEventModal = false
        editingEvent = null
        isCreating = false
      })
    } catch (error) {
      console.error('Error saving event:', error)
    }
  }
  
  function handleEventCancel() {
    // Defer clearing to avoid immediate reactivity clashes with the modal internals
    queueMicrotask(() => {
      showEventModal = false
      editingEvent = null
      isCreating = false
    })
  }
  
  async function handleEventDelete(eventId) {
    try {
      await api.deleteEvent(eventId)
      await refreshCalendarEvents()
      queueMicrotask(() => {
        showEventModal = false
        editingEvent = null
        isCreating = false
      })
    } catch (error) {
      console.error('Error deleting event:', error)
    }
  }
  
  // Character filter functions
  function applySelection(ids) {
    selectedCharacterIds = ids
    selectedCharacters.set(ids)
    showAll = ids.length === characters.length
  }
  function selectAllCharacters() { applySelection(characters.map(c => c.id)) }
  function selectNoCharacters() { applySelection([]) }
  function toggleSelectAll() { showAll ? selectNoCharacters() : selectAllCharacters() }
  function onSearchInput(e) { characterSearch = e.target.value || '' }
  $: filteredCharacters = characters.filter(c => c.name.toLowerCase().includes(characterSearch.toLowerCase()))
  
  // Calendar view functions
  function changeView(view) {
    if (calendar) {
      calendar.changeView(view)
      calendarView = view
      refreshCalendarEvents()
    }
  }
  
  function goToToday() {
    if (calendar) {
      calendar.today()
      refreshCalendarEvents()
    }
  }
  
  function goToPrevious() {
    if (calendar) {
      calendar.prev()
      refreshCalendarEvents()
    }
  }
  
  function goToNext() {
    if (calendar) {
      calendar.next()
      refreshCalendarEvents()
    }
  }
</script>

<div class="max-w-7xl mx-auto">
  <div class="mb-6">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Calendar</h1>
        <p class="text-gray-600 dark:text-gray-400">View and manage your events and schedules.</p>
      </div>
      
      <!-- Character Filters (compact & clickable chips) -->
      <div class="w-full md:max-w-md">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Characters:</span>
          <button on:click={toggleSelectAll} class="text-xs px-2 py-1 rounded {showAll ? 'bg-nw-blue text-white' : 'bg-gray-500 text-white'}">{showAll ? 'All' : 'None'}</button>
          <input type="text" placeholder="Search..." value={characterSearch} on:input={onSearchInput} class="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 w-32 sm:w-40" />
        </div>
        <div class="overflow-x-auto whitespace-nowrap">
          <div class="inline-flex items-center gap-1 px-1">
            {#each filteredCharacters as character}
              {@const active = selectedCharacterIds.includes(character.id)}
              <span role="button" tabindex="0" aria-pressed={active} title={character.name}
                class="chip cursor-pointer select-none px-2 py-0.5 text-xs rounded-full border transition-colors {active ? 'bg-nw-blue text-white border-nw-blue' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                on:click={() => { const s = new Set(selectedCharacterIds); if (s.has(character.id)) s.delete(character.id); else s.add(character.id); applySelection(Array.from(s)) }}
                on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const s = new Set(selectedCharacterIds); if (s.has(character.id)) s.delete(character.id); else s.add(character.id); applySelection(Array.from(s)) } }}>
                {character.name}
              </span>
            {/each}
          </div>
        </div>
      </div>
    </div>
    
    
  </div>
  
  {#if loading}
    <div class="flex items-center justify-center h-96">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-nw-blue"></div>
    </div>
  {:else}
    <!-- Calendar -->
    <div class="card">
      <div bind:this={calendarEl} class="calendar-container"></div>
    </div>
    
    <!-- Legend -->
    <div class="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">Legend</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-red-500 rounded"></div>
          <span class="text-gray-600 dark:text-gray-400">War</span>
        </div>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-orange-500 rounded"></div>
          <span class="text-gray-600 dark:text-gray-400">Invasion</span>
        </div>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-purple-500 rounded"></div>
          <span class="text-gray-600 dark:text-gray-400">Company Event</span>
        </div>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-cyan-500 rounded"></div>
          <span class="text-gray-600 dark:text-gray-400">PvE</span>
        </div>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-blue-200 rounded"></div>
          <span class="text-gray-600 dark:text-gray-400">Daily Reset</span>
        </div>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-orange-200 rounded"></div>
          <span class="text-gray-600 dark:text-gray-400">Weekly Reset</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Event Modal -->
{#if showEventModal}
  <EventModal
    bind:show={showEventModal}
    {editingEvent}
    {characters}
    {statuses}
    {isCreating}
    on:save={(e) => handleEventSave(e.detail)}
    on:cancel={handleEventCancel}
    on:delete={(e) => handleEventDelete(e.detail)}
  />
{/if}

<style>
  :global(.calendar-container) {
    background: white;
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  :global(.dark .calendar-container) {
    background: #1f2937;
  }
  
  :global(.fc-toolbar) {
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    padding: 1rem;
  }
  
  :global(.dark .fc-toolbar) {
    background: #374151;
    border-bottom: 1px solid #4b5563;
  }
  
  :global(.fc-toolbar-title) {
    color: #111827;
    font-size: 1.25rem;
    font-weight: 600;
  }
  
  :global(.dark .fc-toolbar-title) {
    color: #f9fafb;
  }
  
  :global(.fc-button) {
    background: #3b82f6;
    border: 1px solid #3b82f6;
    color: white;
    font-size: 0.875rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
  }
  
  :global(.fc-button:hover) {
    background: #2563eb;
    border-color: #2563eb;
  }
  
  :global(.fc-button:disabled) {
    background: #9ca3af;
    border-color: #9ca3af;
    opacity: 0.5;
  }
  
  :global(.fc-daygrid-day) {
    background: white;
    border-color: #e5e7eb;
  }
  
  :global(.dark .fc-daygrid-day) {
    background: #1f2937;
    border-color: #374151;
  }
  
  :global(.fc-daygrid-day:hover) {
    background: #f3f4f6;
  }
  
  :global(.dark .fc-daygrid-day:hover) {
    background: #374151;
  }
  
  :global(.fc-col-header) {
    background: #f9fafb;
    border-color: #e5e7eb;
    font-weight: 600;
    color: #374151;
  }
  
  :global(.dark .fc-col-header) {
    background: #374151;
    border-color: #4b5563;
    color: #d1d5db;
  }
  
  :global(.fc-event) {
    border-radius: 0.25rem;
    font-size: 0.75rem;
    padding: 0.125rem 0.25rem;
    margin: 0.125rem 0;
  }
  
  :global(.reset-marker) {
    opacity: 0.6;
    font-size: 0.625rem;
  }
  
  :global(.fc-event-title) {
    font-weight: 500;
  }
  
  :global(.fc-daygrid-event) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  :global(.fc-timegrid-event) {
    border-radius: 0.25rem;
  }
  
  :global(.fc-today) {
    background: rgba(59, 130, 246, 0.1) !important;
  }
  
  :global(.dark .fc-today) {
    background: rgba(59, 130, 246, 0.2) !important;
  }
  .chip { cursor: pointer; }
</style>