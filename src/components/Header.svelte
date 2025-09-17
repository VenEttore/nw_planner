<script>
  import { onMount } from 'svelte'
  import { darkMode } from '../stores/ui'
  import { allNotifications, warAlerts, warUnreadCount, readKeys, markGroupRead, markGroupUnread, markAllUnread } from '../stores/notifications'
  import { startWarAlertsPolling, stopWarAlertsPolling } from '../services/warAlertsService'

  let darkModeEnabled = false
  let showWarningsPanel = false

  // Derived store bindings
  let alerts = []
  let unread = 0
  let readSet = new Set()

  const unsubscribers = []

  onMount(() => {
    const unsubDark = darkMode.subscribe(value => {
      darkModeEnabled = value
      if (darkModeEnabled) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    })
    unsubscribers.push(unsubDark)

    // wire notifications
    unsubscribers.push(warAlerts.subscribe(v => { alerts = v || [] }))
    unsubscribers.push(warUnreadCount.subscribe(v => { unread = v || 0 }))
    unsubscribers.push(readKeys.subscribe(v => { readSet = v || new Set() }))

    startWarAlertsPolling()

    return () => {
      stopWarAlertsPolling()
      for (const u of unsubscribers) try { u() } catch {}
    }
  })

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
    <!-- Upcoming Events (removed from header to keep focus; could be restored) -->
    <div class="flex-1"></div>

    <!-- Right - Notifications, Settings and Dark Mode -->
    <div class="flex items-center space-x-4">
      <!-- Notification bell -->
      <div class="relative">
        <button
          class="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
          on:click={() => showWarningsPanel = !showWarningsPanel}
          title="War alerts"
        >
          <svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {#if unread > 0}
            <span class="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{unread}</span>
          {/if}
        </button>
        {#if showWarningsPanel}
          <div class="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50">
            <div class="p-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
              <span>War Alerts</span>
              <button class="text-xs text-gray-600 dark:text-gray-300 hover:underline" on:click={() => { markAllUnread(); showWarningsPanel = false; setTimeout(()=> showWarningsPanel = true, 0) }}>Show all</button>
            </div>
            {#if alerts.length === 0}
              <div class="p-3 text-xs text-gray-600 dark:text-gray-400">No alerts in the next 48 hours.</div>
            {:else}
              <div class="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                {#each alerts as g}
                  <div class="p-2 text-xs text-gray-700 dark:text-gray-300">
                    <div class="flex items-center justify-between mb-1">
                      <div class="font-medium">{g.title}</div>
                      {#if g.severity === 'hard'}
                        <span class="px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">Conflict</span>
                      {:else}
                        <span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">Warning</span>
                      {/if}
                    </div>
                    {#if g.description}
                      <div class="mb-1 text-[11px] text-gray-600 dark:text-gray-400">{g.description}</div>
                    {/if}
                    <ul class="space-y-1">
                      {#each g.items as ev}
                        <li class="flex items-center justify-between">
                          <span class="truncate mr-2">{ev.name}{ev.warType ? ` (${ev.warType})` : ''}{ev.server ? ` • ${ev.server}` : ''}</span>
                          <span class="text-[10px] text-gray-500">{new Date(ev.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        </li>
                      {/each}
                    </ul>
                    <div class="mt-2 flex justify-end">
                      <button class="text-[11px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600" on:click={() => { if (readSet.has(g.key)) { markGroupUnread(g.key) } else { markGroupRead(g.key) } }}>
                        {readSet.has(g.key) ? 'Mark unread' : 'Mark as read'}
                      </button>
                    </div>
                  </div>
                {/each}
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