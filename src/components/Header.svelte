<script>
  import { onMount } from 'svelte'
  import { darkMode } from '../stores/ui'
  import api from '../services/api.js'
  
  let darkModeEnabled = false
  let eventsLoading = true
  let statuses = []
  let upcomingEvents = []
  let refreshIntervalId = null
  
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
    } catch (error) {
      console.error('Error loading upcoming events:', error)
      upcomingEvents = []
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
    
    <!-- Right - Settings and Dark Mode -->
    <div class="flex items-center space-x-4">
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