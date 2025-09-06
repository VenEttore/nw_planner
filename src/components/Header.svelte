<script>
  import { onMount } from 'svelte'
  import { darkMode } from '../stores/ui'
  import api from '../services/api.js'
  
  let darkModeEnabled = false
  let eventsLoading = true
  let statuses = []
  let upcomingEvents = []
  let refreshIntervalId = null
  let warnings = []
  let readWarningIds = new Set(JSON.parse(localStorage.getItem('nw_warning_read_ids') || '[]'))
  let showWarningsPanel = false
  
  onMount(async () => {
    await loadUpcomingEvents()
    
    const unsubscribeDark = darkMode.subscribe(value => {
      darkModeEnabled = value
      if (darkModeEnabled) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    })
    
    const handleFocus = () => loadUpcomingEvents()
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) loadUpcomingEvents()
    })
    refreshIntervalId = setInterval(loadUpcomingEvents, 60000)
    
    return () => {
      unsubscribeDark()
      window.removeEventListener('focus', handleFocus)
      if (refreshIntervalId) clearInterval(refreshIntervalId)
    }
  })
  
  async function loadUpcomingEvents() {
    eventsLoading = true
    try {
      try { statuses = await api.getParticipationStatuses() } catch { statuses = [] }
      const events = await api.getUpcomingEvents(10)
      const now = new Date()
      const cutoff = new Date(now.getTime() + 20 * 60 * 60 * 1000)
      function isStatusAbsent(name){
        if (!name) return false
        const s = (statuses || []).find(st => st.name === name)
        if (s) return !!s.is_absent
        return name === 'Absent'
      }
      upcomingEvents = events
        .filter(e => {
          if (isStatusAbsent(e.participation_status || 'Signed Up')) return false
          const t = new Date(e.event_time)
          return t >= now && t <= cutoff
        })
        .sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
        .slice(0, 3)
      // Load warnings for the next 48 hours
      try {
        const warnStart = now.toISOString()
        const warnEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
        const results = await api.getWarConflictsForRange(warnStart, warnEnd)
        const all = results.filter(r => (r.counts?.hard || 0) > 0 || (r.counts?.soft || 0) > 0)
        warnings = all
      } catch (e) {
        warnings = []
      }
    } catch (error) {
      console.error('Error loading upcoming events:', error)
      upcomingEvents = []
      warnings = []
    } finally {
      eventsLoading = false
    }
  }
  
  function toggleDarkMode() {
    darkMode.update(value => !value)
  }
  
  function formatEventDateTime(isoString) {
    const d = new Date(isoString)
    const date = d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    return `${date} • ${time}`
  }
</script>

<header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-3">
  <div class="flex items-center justify-between gap-4">
    <!-- Upcoming Events -->
    <div class="flex items-center space-x-4">
      <div class="relative">
        <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
          Upcoming Events
        </div>
        <div class="flex space-x-2">
          {#if eventsLoading}
            <div class="px-3 py-1 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
              Loading...
            </div>
          {:else if upcomingEvents.length === 0}
            <div class="px-3 py-1 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
              No upcoming events
            </div>
          {:else}
            {#each upcomingEvents as evt}
              <div class="px-3 py-2 text-sm rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[200px]">
                <div class="font-medium text-gray-900 dark:text-white truncate">{evt.name}</div>
                <div class="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">{evt.event_type}{#if evt.server_name} • {evt.server_name}{/if}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatEventDateTime(evt.event_time)}</div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
    
    <!-- Right - Notifications, Settings and Dark Mode -->
    <div class="flex items-center space-x-4">
      <!-- Notification bell -->
      <div class="relative">
        <button
          class="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
          on:click={() => showWarningsPanel = !showWarningsPanel}
          title="War warnings"
        >
          <svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {#if warnings.length > 0}
            <span class="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{warnings.filter(w => !readWarningIds.has(w.event_id)).length}</span>
          {/if}
        </button>
        {#if showWarningsPanel}
          <div class="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50">
            <div class="p-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">War Warnings</div>
            {#if warnings.length === 0}
              <div class="p-3 text-xs text-gray-600 dark:text-gray-400">No warnings in the next 48 hours.</div>
            {:else}
              <div class="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                {#each warnings as w}
                  <div class="p-2 text-xs text-gray-700 dark:text-gray-300">
                    <div class="flex items-center justify-between">
                      <div class="font-medium">Event #{w.event_id}</div>
                      {#if (w.counts?.hard || 0) > 0}
                        <span class="px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">{w.counts.hard} hard</span>
                      {:else if (w.counts?.soft || 0) > 0}
                        <span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">{w.counts.soft} soft</span>
                      {/if}
                    </div>
                    <div class="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                      {#if w.summaries.caps === 'hard'}Cap limit reached on day. {/if}
                      {#if w.summaries.overlaps === 'hard'}Overlap with ≥2 Confirmed. {/if}
                      {#if w.summaries.overlaps === 'soft'}Overlap with 1 Confirmed + others non-absent. {/if}
                      {#if w.summaries.steamDupes === 'soft'}Same-Steam + same server + same type; pre-slot needed. {/if}
                    </div>
                    <div class="mt-2 flex justify-end gap-2">
                      {#if !readWarningIds.has(w.event_id)}
                        <button class="text-[11px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600" on:click={() => { readWarningIds.add(w.event_id); localStorage.setItem('nw_warning_read_ids', JSON.stringify(Array.from(readWarningIds))); }}>
                          Mark as read
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
              <div class="p-2 border-t border-gray-200 dark:border-gray-700 text-right">
                <button class="text-xs text-gray-600 dark:text-gray-300 hover:underline" on:click={() => { readWarningIds = new Set(); localStorage.removeItem('nw_warning_read_ids'); }}>
                  Mark all unread
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <button
        class="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        on:click={toggleDarkMode}
        title="Toggle dark mode"
      >
        {#if darkModeEnabled}
          <svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
          </svg>
        {:else}
          <svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
          </svg>
        {/if}
      </button>
      
      <div class="text-sm text-gray-600 dark:text-gray-400">
        <div class="text-right">
          <div class="font-medium">Local Time</div>
          <div class="text-xs">{new Date().toLocaleTimeString()}</div>
        </div>
      </div>
    </div>
  </div>
</header>

<style>
  /* Retain empty style block for potential header-specific styles */
</style> 