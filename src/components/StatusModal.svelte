<script>
  import { createEventDispatcher } from 'svelte'
  export let isOpen = false
  export let status = null
  const dispatch = createEventDispatcher()

  let form = { name: '', slug: '', color_bg: 'bg-blue-50', color_text: 'text-blue-800', sort_order: 0, is_absent: false, is_default: false }
  $: if (isOpen) {
    form = status ? { ...status } : { name: '', slug: '', color_bg: 'bg-blue-50', color_text: 'text-blue-800', sort_order: 0, is_absent: false, is_default: false }
  }

  function close(){ dispatch('cancel') }
  function save(){ dispatch('save', { ...form }) }
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true" on:click={(e)=> e.target===e.currentTarget && close()}>
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-5" on:click|stopPropagation>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{status ? 'Edit' : 'New'} Status</h2>
        <button class="text-gray-500" on:click={close}>✕</button>
      </div>

      <div class="space-y-3">
        <div>
          <label class="block text-sm text-gray-700 dark:text-gray-300 mb-1">Name</label>
          <input class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.name} />
        </div>
        <div>
          <label class="block text-sm text-gray-700 dark:text-gray-300 mb-1">Slug</label>
          <input class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.slug} />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-gray-700 dark:text-gray-300 mb-1">BG Class</label>
            <input class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.color_bg} />
          </div>
          <div>
            <label class="block text-sm text-gray-700 dark:text-gray-300 mb-1">Text Class</label>
            <input class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.color_text} />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-gray-700 dark:text-gray-300 mb-1">Sort Order</label>
            <input type="number" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white" bind:value={form.sort_order} />
          </div>
          <div class="flex items-center gap-2 pt-6">
            <input type="checkbox" bind:checked={form.is_absent} id="absent" />
            <label for="absent" class="text-sm text-gray-700 dark:text-gray-300">Mark as Absent</label>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 mt-4">
        <button class="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300" on:click={close}>Cancel</button>
        <button class="px-3 py-1.5 bg-nw-blue text-white rounded-md" on:click={save} disabled={!form.name || !form.slug}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
</style>


