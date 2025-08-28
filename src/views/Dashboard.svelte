<script>
  import { onMount } from 'svelte'
  import { currentView } from '../stores/ui'
  import api from '../services/api.js'
  import EventModal from '../components/EventModal.svelte'
  
  let loading = true
  let characters = []
  let displayedTasks = []
  let upcomingEvents = []
  let statuses = []
  let showAbsent = true
  let resetTimers = {}
  let activeTimers = []
  let selectedCharacterServers = [] // array of { name, timezone }
  let selectedCharacterId = null
  let showEventModal = false
  let editingEvent = null

  // Tasks card controls
  let showCompleted = false
  let viewMode = 'byCharacter' // 'byCharacter' | 'byType'
  let typeView = 'daily' // 'daily' | 'weekly' | 'one-time'

  // Cache of tasks for each character (for byType view)
  let tasksByCharacter = {}
  
  // Persistence for dashboard preferences (tasks + events toggles)
  const PERSIST_KEY = 'nw_dash_tasks_prefs'
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (!raw) return
      const p = JSON.parse(raw)
      if (p && typeof p === 'object') {
        if (p.viewMode === 'byCharacter' || p.viewMode === 'byType') viewMode = p.viewMode
        if (p.typeView === 'daily' || p.typeView === 'weekly' || p.typeView === 'one-time') typeView = p.typeView
        if (typeof p.showCompleted === 'boolean') showCompleted = p.showCompleted
        if (typeof p.selectedCharacterId === 'number') selectedCharacterId = p.selectedCharacterId
        if (typeof p.showAbsent === 'boolean') showAbsent = p.showAbsent
      }
    } catch {}
  }
  function savePrefs() {
    try {
      const data = { viewMode, typeView, showCompleted, selectedCharacterId, showAbsent }
      localStorage.setItem(PERSIST_KEY, JSON.stringify(data))
    } catch {}
  }
  
  onMount(async () => {
    loadPrefs()
    await loadData()
    if (selectedCharacterServers.length > 0) {
      startResetTimers()
    }
    
    // Cleanup on unmount
    return () => {
      stopAllTimers()
    }
  })
  
  async function loadData() {
    loading = true
    try {
      // Load characters
      characters = await api.getActiveCharacters()
      
      // Load tasks for selected character (default to first)
      if (characters.length > 0) {
        const hasSelected = characters.some(c => c.id === selectedCharacterId)
        if (!hasSelected) selectedCharacterId = characters[0].id
        // Load all characters' tasks for byType view and cache
        try {
          const results = await Promise.all(
            characters.map(async (c) => [c.id, await api.getCharacterTasks(c.id)])
          )
          tasksByCharacter = Object.fromEntries(results)
        } catch (e) {
          tasksByCharacter = {}
        }
        displayedTasks = tasksByCharacter[selectedCharacterId] || []
        
        // Extract unique servers from characters with timezone
        const pairs = characters.map(c => ({ name: c.server_name, timezone: c.server_timezone }))
        const byKey = new Map()
        for (const p of pairs) {
          if (!p.name || !p.timezone) continue
          const key = `${p.name}|${p.timezone}`
          if (!byKey.has(key)) byKey.set(key, p)
        }
        selectedCharacterServers = Array.from(byKey.values())
      }
      
      // Load statuses
      try { statuses = await api.getParticipationStatuses() } catch { statuses = [] }

      // Load upcoming events (limit to next 7 days)
      try {
        const events = await api.getUpcomingEvents(20)
        const now = new Date()
        const cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        const filtered = events
          .filter(e => {
            const t = new Date(e.event_time)
            return t >= now && t <= cutoff
          })
          .sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
          .slice(0, 5)
        upcomingEvents = filtered.map(event => ({
          ...event,
          time: new Date(event.event_time).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          server: event.server_name || 'Unknown'
        }))
      } catch (error) {
        console.error('Error loading events:', error)
        upcomingEvents = []
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      loading = false
      savePrefs()
    }
  }

  let rsvpPending = {}
  async function updateRsvpStatus(eventId, newStatus) {
    try {
      const p = api.updateEventRsvp(eventId, newStatus)
      rsvpPending[eventId] = p; rsvpPending = { ...rsvpPending }
      await p
      // Patch the single event to avoid full reload/race
      try {
        const fresh = await api.getEventById(eventId)
        if (fresh) {
          upcomingEvents = (upcomingEvents || []).map(e => e.id === eventId ? {
            ...e,
            participation_status: fresh.participation_status
          } : e)
        }
      } catch {}
    } catch (error) {
      console.error('Error updating RSVP:', error)
    } finally { delete rsvpPending[eventId]; rsvpPending = { ...rsvpPending } }
  }

  async function openEditEvent(ev) {
    try { if (rsvpPending[ev.id]) await rsvpPending[ev.id] } catch {}
    try { editingEvent = await api.getEventById(ev.id) || ev } catch { editingEvent = ev }
    showEventModal = true
  }

  async function handleEventSave(e) {
    const data = e.detail
    try {
      if (editingEvent) {
        await api.updateEvent(editingEvent.id, data)
      }
      showEventModal = false
      editingEvent = null
      await loadData()
    } catch (err) {
      console.error('Error saving event:', err)
    }
  }

  async function handleEventDelete(e) {
    const id = e.detail
    try {
      await api.deleteEvent(id)
      showEventModal = false
      editingEvent = null
      await loadData()
    } catch (err) {
      console.error('Error deleting event:', err)
    }
  }

  function rsvpDotClass(status) {
    return status === 'Confirmed'
      ? 'bg-green-500'
      : status === 'Signed Up'
      ? 'bg-blue-500'
      : status === 'Tentative'
      ? 'bg-yellow-500'
      : 'bg-gray-500'
  }

  // Derived: visible events honoring showAbsent flag
  $: visibleEvents = (upcomingEvents || []).filter(e => showAbsent ? true : (e.participation_status !== 'Absent'))

  function getPriorityClass(priority) {
    const p = (priority || '').toLowerCase()
    if (p === 'critical') return 'priority-critical'
    if (p === 'high') return 'priority-high'
    if (p === 'medium') return 'priority-medium'
    if (p === 'low') return 'priority-low'
    return 'text-gray-500 dark:text-gray-400'
  }

  async function startResetTimers() {
    // Start timers for all unique servers from active characters
    if (selectedCharacterServers.length > 0) {
      try {
        // Get initial reset timer data
        const resetData = await api.getResetTimersForServers(selectedCharacterServers)
        
        // Initialize reset timers object
        resetData.forEach(data => {
          if (!data.error) {
            resetTimers[data.server] = {
              daily: data.daily,
              weekly: data.weekly,
              serverTime: data.serverTime
            }
          }
        })
        
        // Start live timers for each server
        for (const srv of selectedCharacterServers) {
          const timerId = await api.startResetTimerForServer(srv, (timerData) => {
            // Update the reactive variable when timer updates
            resetTimers[timerData.server] = {
              daily: timerData.daily,
              weekly: timerData.weekly,
              serverTime: timerData.serverTime
            }
            // Trigger reactivity
            resetTimers = { ...resetTimers }
          })
          
          if (timerId) {
            activeTimers.push(timerId)
          }
        }
      } catch (error) {
        console.error('Error starting reset timers:', error)
      }
    }
  }

  function stopAllTimers() {
    activeTimers.forEach(timerId => {
      api.stopResetTimer(timerId)
    })
    activeTimers = []
  }

  async function toggleTaskCompletion(task) {
    if (!selectedCharacterId && viewMode === 'byCharacter') return
    
    try {
      const targetCharacterId = viewMode === 'byType' ? task.__characterId : selectedCharacterId
      if (!targetCharacterId) return
      if (task.completed) {
        await api.markTaskIncomplete(task.id, targetCharacterId, task.resetPeriod)
      } else {
        await api.markTaskComplete(task.id, targetCharacterId, task.resetPeriod)
      }
      // Reload relevant tasks
      if (viewMode === 'byCharacter') {
        await loadTasksForCharacter(selectedCharacterId)
      } else {
        // refresh only that character's tasks in the cache
        const refreshed = await api.getCharacterTasks(targetCharacterId)
        tasksByCharacter = { ...tasksByCharacter, [targetCharacterId]: refreshed }
      }
    } catch (error) {
      console.error('Error toggling task completion:', error)
    }
  }

  async function loadTasksForCharacter(characterId) {
    try {
      selectedCharacterId = characterId
      if (!characterId) { displayedTasks = []; return }
      const characterTasks = await api.getCharacterTasks(characterId)
      displayedTasks = characterTasks
      savePrefs()
    } catch (e) {
      displayedTasks = []
    }
  }

  // Priority sorting helper for tasks
  function getPriorityRank(p) {
    switch ((p || '').toLowerCase()) {
      case 'critical': return 3
      case 'high': return 2
      case 'medium': return 1
      default: return 0
    }
  }

  // Apply show/hide completed filter for byCharacter view
  $: filteredDisplayedTasks = (displayedTasks || []).filter(t => showCompleted ? true : !t.completed)

  // Split and sort tasks by type and priority (byCharacter)
  $: dailyTasks = (filteredDisplayedTasks || [])
    .filter(t => t.type === 'daily')
    .sort((a, b) => getPriorityRank(b.priority) - getPriorityRank(a.priority) || a.name.localeCompare(b.name))
  $: weeklyTasks = (filteredDisplayedTasks || [])
    .filter(t => t.type === 'weekly')
    .sort((a, b) => getPriorityRank(b.priority) - getPriorityRank(a.priority) || a.name.localeCompare(b.name))
  $: oneTimeTasks = (filteredDisplayedTasks || [])
    .filter(t => t.type === 'one-time')
    .sort((a, b) => getPriorityRank(b.priority) - getPriorityRank(a.priority) || a.name.localeCompare(b.name))

  // ByType groupings: build list of { character, tasks } based on typeView
  $: byTypeGroups = (characters || []).map(c => {
    const tasks = (tasksByCharacter[c.id] || [])
      .filter(t => {
        if (typeView === 'daily') return t.type === 'daily'
        if (typeView === 'weekly') return t.type === 'weekly'
        return t.type === 'one-time'
      })
      .filter(t => showCompleted ? true : !t.completed)
      .map(t => ({ ...t, __characterId: c.id }))
      .sort((a, b) => getPriorityRank(b.priority) - getPriorityRank(a.priority) || a.name.localeCompare(b.name))
    return { character: c, tasks }
  }).filter(group => group.tasks.length > 0)

  // For byType empty state: detect if any tasks of the selected type exist at all (ignoring completion filter)
  $: anyTasksOfSelectedType = (characters || []).some(c => {
    const list = tasksByCharacter[c.id] || []
    if (typeView === 'daily') return list.some(t => t.type === 'daily')
    if (typeView === 'weekly') return list.some(t => t.type === 'weekly')
    return list.some(t => t.type === 'one-time')
  })
</script>

<div class="max-w-7xl mx-auto">
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Dashboard</h1>
    <p class="text-gray-600 dark:text-gray-400">Welcome back! Here's your New World overview.</p>
  </div>
  
  {#if loading}
    <div class="flex items-center justify-center h-64">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-nw-blue"></div>
    </div>
  {:else}
    
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left column: Upcoming Events above Tasks -->
      <div class="lg:col-span-2 space-y-6">
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Upcoming Events</h2>
            <button
              type="button"
              class={`text-[10px] rounded-md border px-2 py-1 transition-colors ${showAbsent
                ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 cursor-pointer'
                : 'opacity-80 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer'}`}
              on:click={() => { showAbsent = !showAbsent; savePrefs() }}
              aria-pressed={showAbsent}
              title={showAbsent ? 'Hide Absent events' : 'Show Absent events'}
            >
              {showAbsent ? 'Hide Absent' : 'Show Absent'}
            </button>
          </div>
          {#if visibleEvents.length > 0}
            <div class="space-y-2">
              {#each visibleEvents as event}
                <div class="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" role="button" tabindex="0" on:click={() => openEditEvent(event)} on:keydown={(e)=> (e.key==='Enter'||e.key===' ') && openEditEvent(event)}>
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-gray-900 dark:text-white text-sm">{event.name}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{event.event_type}</span>
                      </div>
                      <div class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        📅 {event.time} - {event.server}
                        {#if event.location} • 📍 {event.location}{/if}
                      </div>
                      {#if event.description}
                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">{event.description}</div>
                      {/if}
                    </div>
                    <div class="ml-3 flex items-center gap-2">
                      <span class={`w-2 h-2 rounded-full ${rsvpDotClass(event.participation_status || 'Signed Up')}`} aria-hidden="true"></span>
                      <select 
                        on:click|stopPropagation
                        value={event.participation_status || 'Signed Up'}
                        on:change={(e) => updateRsvpStatus(event.id, e.target.value)}
                        class="text-[10px] px-1.5 py-0.5 rounded border bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                      >
                        {#each (statuses.length ? statuses : [
                          { name: 'Signed Up' },
                          { name: 'Confirmed' },
                          { name: 'Tentative' },
                          { name: 'Absent' }
                        ]) as s}
                          <option value={s.name}>{s.name}</option>
                        {/each}
                      </select>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center text-gray-500 dark:text-gray-400 py-4">
              <p class="text-sm">No upcoming events</p>
              <button class="mt-2 text-sm text-nw-blue hover:text-nw-blue-dark" on:click={() => currentView.set('events')}>Create an event →</button>
            </div>
          {/if}
        </div>

        <div class="card">
          <div class="mb-3">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Tasks</h2>
            </div>

            {#if characters.length > 0}
              <!-- Second row: view and filters (left aligned) -->
              <div class="mt-3 flex items-center gap-4">
                <label for="dash-viewmode" class="text-xs text-gray-700 dark:text-gray-300">View</label>
                <select id="dash-viewmode" bind:value={viewMode} on:change={savePrefs} class="select-input-xs">
                  <option value="byCharacter">By Character</option>
                  <option value="byType">By Type</option>
                </select>

                {#if viewMode === 'byCharacter'}
                  <label for="dash-character" class="text-xs text-gray-700 dark:text-gray-300">Character</label>
                  <select id="dash-character" bind:value={selectedCharacterId} on:change={(e)=> loadTasksForCharacter(parseInt(e.target.value))} class="select-input-xs">
                    {#each characters as c}
                      <option value={c.id}>{c.name}</option>
                    {/each}
                  </select>
                {:else}
                  <label for="dash-type" class="text-xs text-gray-700 dark:text-gray-300">Type</label>
                  <select id="dash-type" bind:value={typeView} on:change={savePrefs} class="select-input-xs">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="one-time">One-time</option>
                  </select>
                {/if}
              </div>

              <!-- Third row: toggle (left aligned) -->
              <div class="mt-2 flex justify-start">
                <button
                  type="button"
                  class={`text-xs rounded-md border px-3 py-1.5 transition-colors ${showCompleted 
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 cursor-pointer' 
                    : 'opacity-80 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer'}`}
                  on:click={() => { showCompleted = !showCompleted; savePrefs() }}
                  aria-pressed={showCompleted}
                  title={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
                >
                  {showCompleted ? 'Hide Completed' : 'Show Completed'}
                </button>
              </div>
            {/if}
          </div>
          {#if characters.length === 0}
            <div class="text-center text-gray-500 dark:text-gray-400 py-4">
              <p class="text-sm">No characters yet.</p>
              <button class="mt-2 text-sm text-nw-blue hover:text-nw-blue-dark" on:click={() => currentView.set('characters')}>
                Create your first character →
              </button>
            </div>
          {:else}
            {#if viewMode === 'byCharacter' && displayedTasks.length === 0}
              <div class="text-center text-gray-500 dark:text-gray-400 py-4">
                <p class="text-sm">No tasks assigned to this character.</p>
                <button class="mt-2 text-sm text-nw-blue hover:text-nw-blue-dark" on:click={() => currentView.set('tasks')}>
                  Create or assign tasks →
                </button>
              </div>
            {:else if viewMode === 'byCharacter'}
              <div class="space-y-4">
                {#if !showCompleted && dailyTasks.length === 0 && weeklyTasks.length === 0 && oneTimeTasks.length === 0}
                  <div class="text-center text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md py-3 text-sm">
                    🎉 All tasks for {characters.find(c=>c.id===selectedCharacterId)?.name || 'this character'} are completed. Great job!
                  </div>
                {/if}
                {#if dailyTasks.length > 0}
                  <div>
                    <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Daily</div>
                    <div class="space-y-2">
                      <div class="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                        {#each dailyTasks as task (task.id)}
                          <div class="flex items-center justify-between px-2 py-1.5">
                            <div class="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                checked={task.completed}
                                on:change={() => toggleTaskCompletion(task)}
                                class="w-4 h-4 text-nw-blue border-gray-300 rounded focus:ring-nw-blue dark:focus:ring-nw-blue dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                              />
                              <span class="text-sm text-gray-900 dark:text-white {task.completed ? 'line-through opacity-50' : ''}">{task.name}</span>
                              <span class={`text-[10px] ml-2 ${getPriorityClass(task.priority)}`}>{task.priority}</span>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  </div>
                {/if}

                {#if weeklyTasks.length > 0}
                  <div>
                    <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Weekly</div>
                    <div class="space-y-2">
                      <div class="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                        {#each weeklyTasks as task (task.id)}
                          <div class="flex items-center justify-between px-2 py-1.5">
                            <div class="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                checked={task.completed}
                                on:change={() => toggleTaskCompletion(task)}
                                class="w-4 h-4 text-nw-blue border-gray-300 rounded focus:ring-nw-blue dark:focus:ring-nw-blue dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                              />
                              <span class="text-sm text-gray-900 dark:text-white {task.completed ? 'line-through opacity-50' : ''}">{task.name}</span>
                              <span class={`text-[10px] ml-2 ${getPriorityClass(task.priority)}`}>{task.priority}</span>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  </div>
                {/if}

                {#if oneTimeTasks.length > 0}
                  <div>
                    <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">One-time</div>
                    <div class="space-y-2">
                      <div class="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                        {#each oneTimeTasks as task (task.id)}
                          <div class="flex items-center justify-between px-2 py-1.5">
                            <div class="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                checked={task.completed}
                                on:change={() => toggleTaskCompletion(task)}
                                class="w-4 h-4 text-nw-blue border-gray-300 rounded focus:ring-nw-blue dark:focus:ring-nw-blue dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                              />
                              <span class="text-sm text-gray-900 dark:text-white {task.completed ? 'line-through opacity-50' : ''}">{task.name}</span>
                              <span class={`text-[10px] ml-2 ${getPriorityClass(task.priority)}`}>{task.priority}</span>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            {:else}
              <!-- By Type view: list chosen type for each character with tasks -->
              {#if byTypeGroups.length === 0}
                <div class="text-center text-gray-500 dark:text-gray-400 py-4">
                  {#if !showCompleted && anyTasksOfSelectedType}
                    <p class="text-sm text-green-700 dark:text-green-400">✅ All {typeView} tasks completed. Nice work!</p>
                  {:else}
                    <p class="text-sm">No {typeView} tasks available.</p>
                  {/if}
                </div>
              {:else}
                <div class="space-y-3">
                  {#each byTypeGroups as group (group.character.id)}
                    <div class="rounded-lg border border-gray-200 dark:border-gray-600 p-2">
                      <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{group.character.name}</div>
                      <div class="divide-y divide-gray-200 dark:divide-gray-700 rounded-md overflow-hidden">
                        {#each group.tasks as task (`${task.id}-${task.__characterId}`)}
                          <div class="flex items-center justify-between px-2 py-1.5">
                            <div class="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                checked={task.completed}
                                on:change={() => toggleTaskCompletion(task)}
                                class="w-4 h-4 text-nw-blue border-gray-300 rounded focus:ring-nw-blue dark:focus:ring-nw-blue dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                              />
                              <span class="text-sm text-gray-900 dark:text-white {task.completed ? 'line-through opacity-50' : ''}">{task.name}</span>
                              <span class={`text-[10px] ml-2 ${getPriorityClass(task.priority)}`}>{task.priority}</span>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}
          {/if}
        </div>
      </div>
      
      <!-- Reset Timers -->
      <div class="space-y-6">
        <div class="card">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Reset Timers</h2>
          
          {#if characters.length === 0}
            <div class="text-center text-gray-500 dark:text-gray-400 py-4">
              <p class="text-sm">Add a character to see server reset timers.</p>
              <button class="mt-2 text-sm text-nw-blue hover:text-nw-blue-dark" on:click={() => currentView.set('characters')}>
                Create your first character →
              </button>
            </div>
          {:else if Object.keys(resetTimers).length > 0}
            <div class="space-y-4">
              {#each Object.entries(resetTimers) as [serverName, timers]}
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <h3 class="text-xs font-medium text-gray-700 dark:text-gray-300">{serverName}</h3>
                    <div class="text-[10px] text-gray-500 dark:text-gray-400">
                      {timers.serverTime ? `${timers.serverTime.time} ${timers.serverTime.date}` : ''}
                    </div>
                  </div>
                  
                  <div class="space-y-1">
                    <div class="flex justify-between items-center">
                      <span class="text-xs text-gray-600 dark:text-gray-400">Daily Reset:</span>
                      <div class="text-base font-bold text-nw-blue">
                        {timers.daily ? timers.daily.formatted : '00:00:00'}
                      </div>
                    </div>
                    
                    <div class="flex justify-between items-center">
                      <span class="text-xs text-gray-600 dark:text-gray-400">Weekly Reset:</span>
                      <div class="text-base font-bold text-orange-500">
                        {timers.weekly ? timers.weekly.formatted : '00:00:00'}
                      </div>
                    </div>
                  </div>
                  
                  {#if timers.daily && timers.daily.totalMs <= 300000}
                    <div class="mt-2 text-xs text-red-600 dark:text-red-400 font-medium">
                      🔄 Daily reset in less than 5 minutes!
                    </div>
                  {/if}
                  
                  {#if timers.weekly && timers.weekly.totalMs <= 1800000}
                    <div class="mt-2 text-xs text-orange-600 dark:text-orange-400 font-medium">
                      🔄 Weekly reset in less than 30 minutes!
                    </div>
                  {/if}
                </div>
                
                {#if Object.entries(resetTimers).length > 1 && serverName !== Object.keys(resetTimers)[Object.keys(resetTimers).length - 1]}
                  <hr class="border-gray-200 dark:border-gray-700" />
                {/if}
              {/each}
            </div>
          {:else}
            <div class="text-center text-gray-500 dark:text-gray-400 py-4">
              <p class="text-sm">Loading reset timers...</p>
              <div class="mt-2">
                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-nw-blue mx-auto"></div>
              </div>
            </div>
          {/if}
        </div>
        
        <!-- Removed duplicate upcoming events (moved above) -->
      </div>
    </div>
  {/if}
  <EventModal show={showEventModal} editingEvent={editingEvent} characters={characters} statuses={statuses} isCreating={false} on:save={handleEventSave} on:cancel={() => { showEventModal = false; editingEvent = null }} on:delete={handleEventDelete} />
</div> 