<script>
  import { createEventDispatcher } from 'svelte'

  export let isOpen = false
  export let template = null // editing template or null
  export let characters = []

  const dispatch = createEventDispatcher()
  import CharacterSelect from './CharacterSelect.svelte'

  const eventTypes = ['War','Invasion','Company Event','PvE','PvP','Custom']
  const participationStatuses = ['Signed Up','Confirmed','Tentative','Absent']

  // Mirror EventModal fields (no validation here):
  let form = {
    name: '',
    description: '',
    event_type: 'Custom',
    server_name: '',
    event_time: '', // datetime-local string
    character_id: '',
    participation_status: 'Signed Up',
    location: '',
    notification_enabled: true,
    notification_minutes: 30,
    time_strategy: '', // 'relative' | 'fixed' | ''
    time_params: {} // relative: { unit: 'hour'|'day'|'week' } ; fixed: { when: 'today'|'tomorrow'|'weekday', weekday?:0-6, timeOfDay:'HH:mm' }
  }

  let initializedForKey = null
  $: if (isOpen) {
    const key = template?.id ?? '__create__'
    if (initializedForKey !== key) {
      if (template) {
      {
        const payload = typeof template.payload_json === 'string' ? JSON.parse(template.payload_json) : (template.payload_json || {})
        const src = Object.keys(payload).length > 0 ? payload : template
        form = {
          name: src.name || '',
          description: src.description || '',
          event_type: src.event_type || 'Custom',
          server_name: src.server_name || '',
          event_time: src.event_time ? src.event_time : '',
          character_id: src.character_id || '',
          participation_status: src.participation_status || 'Signed Up',
          location: src.location || '',
          notification_enabled: src.notification_enabled !== undefined ? !!src.notification_enabled : !!(template.notification_enabled || template.notification_enabled === 1),
          notification_minutes: typeof src.notification_minutes === 'number' ? src.notification_minutes : (typeof template.notification_minutes === 'number' ? template.notification_minutes : 30),
          time_strategy: template.time_strategy || '',
          time_params: typeof template.time_params === 'string' ? JSON.parse(template.time_params) : (template.time_params || {})
        }
      }
      } else {
        form = { ...form, name: '', event_type: 'Custom' }
      }
      initializedForKey = key
    }
  }

  function close() { initializedForKey = null; dispatch('cancel') }
  function save() { dispatch('save', { ...form }) }

  function onBackdropMouseDown(e){ backMd = e.target === e.currentTarget }
  function onBackdropClick(e){ if (e.target === e.currentTarget && backMd) close() }
  let backMd = false
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" on:mousedown={onBackdropMouseDown} on:click={onBackdropClick}>
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" role="document" on:click|stopPropagation>
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{template ? 'Edit Template' : 'Create Template'}</h2>
        <button class="text-gray-500 hover:text-gray-700 dark:text-gray-300" on:click={close}>✕</button>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
          <input class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.name} required />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event Type</label>
            <select class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.event_type}>
              {#each eventTypes as t}<option value={t}>{t}</option>{/each}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Participation</label>
            <select class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.participation_status}>
              {#each participationStatuses as s}<option value={s}>{s}</option>{/each}
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred Character (optional)</label>
          <CharacterSelect characters={characters} bind:value={form.character_id} placeholder="(none)" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timing</label>
          <select class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.time_strategy}>
            <option value="">(none)</option>
            <option value="relative">Relative</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>

        {#if form.time_strategy === 'relative'}
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">When</label>
            <select class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.time_params.unit}>
              <option value="hour">In an hour</option>
              <option value="day">In a day</option>
              <option value="week">In a week</option>
            </select>
          </div>
        {:else if form.time_strategy === 'fixed'}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <select class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.time_params.when}>
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="weekday">Day of week</option>
              </select>
            </div>
            {#if form.time_params.when === 'weekday'}
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Weekday</label>
                <select class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.time_params.weekday}>
                  <option value="0">Sunday</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                </select>
              </div>
            {/if}
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Time</label>
              <input type="time" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.time_params.timeOfDay} />
            </div>
          </div>
        {/if}

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
          <input class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.location} />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.description}></textarea>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex items-center gap-2">
            <input id="notif" type="checkbox" class="w-4 h-4" bind:checked={form.notification_enabled} />
            <label for="notif" class="text-sm text-gray-700 dark:text-gray-300">Enable notifications</label>
          </div>
          {#if form.notification_enabled}
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notify (minutes before)</label>
            <input type="number" min="0" max="1440" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.notification_minutes} />
          </div>
          {/if}
        </div>
      </div>
      <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
        <button class="px-4 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300" on:click={close}>Cancel</button>
        <button class="px-4 py-2 text-sm bg-nw-blue text-white rounded-md" on:click={save} disabled={!form.name}>Save Template</button>
      </div>
    </div>
  </div>
{/if}

<style>
</style>



