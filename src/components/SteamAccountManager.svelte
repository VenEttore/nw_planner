<script>
  import api from '../services/api.js'
  import { createEventDispatcher, onMount } from 'svelte'
  export let isOpen = false
  const dispatch = createEventDispatcher()
  let accounts = []
  let loading = false
  let showForm = false
  let editing = null
  let form = { label: '', notes: '' }

  async function refresh() {
    loading = true
    try { accounts = await api.getSteamAccounts() } catch (e) { accounts = [] }
    loading = false
  }

  onMount(refresh)

  function close() { isOpen = false; dispatch('close') }

  function startCreate() { editing = null; form = { label: '', notes: '' }; showForm = true }
  function startEdit(acc) { editing = acc; form = { label: acc.label, notes: acc.notes || '' }; showForm = true }

  async function submitForm() {
    if (!form.label.trim()) return
    if (editing) await api.updateSteamAccount(editing.id, form)
    else await api.createSteamAccount(form)
    showForm = false; editing = null; await refresh()
  }

  async function deleteAccount(acc) {
    const reassignToId = null // simple first pass: set to none
    await api.deleteSteamAccount(acc.id, { reassignToId })
    await refresh()
  }
</script>

{#if isOpen}
<div class="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true" on:click={close}>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl" role="document" on:click|stopPropagation>
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Manage Steam Accounts</h3>
      <div class="flex gap-2">
        <button class="btn-secondary" on:click={startCreate}>New Account</button>
        <button class="btn-secondary" on:click={close}>Close</button>
      </div>
    </div>
    <div class="p-6 space-y-4">
      {#if showForm}
      <div class="border rounded-md p-3">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="md:col-span-1">
            <label class="block text-sm font-medium mb-1">Label *</label>
            <input class="w-full input" bind:value={form.label} />
          </div>
          
          <div class="md:col-span-1">
            <label class="block text-sm font-medium mb-1">Notes</label>
            <input class="w-full input" bind:value={form.notes} />
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-3">
          <button class="btn-secondary" on:click={() => { showForm=false; editing=null }}>Cancel</button>
          <button class="btn-primary" on:click={submitForm} disabled={!form.label.trim()}>Save</button>
        </div>
      </div>
      {/if}

      {#if loading}
        <div class="text-sm text-gray-500">Loading...</div>
      {:else}
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each accounts as acc}
            <div class="py-3 flex items-center justify-between">
              <div>
                <div class="font-medium">{acc.label}</div>
                <div class="text-xs text-gray-500">{acc.notes || '—'}</div>
              </div>
              <div class="flex gap-2">
                <button class="btn-secondary" on:click={() => startEdit(acc)}>Edit</button>
                <button class="btn-danger" on:click={() => deleteAccount(acc)}>Delete</button>
              </div>
            </div>
          {/each}
          {#if accounts.length === 0}
            <div class="py-6 text-sm text-gray-500">No Steam accounts yet.</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
  .btn-primary{ padding: 0.5rem 0.75rem; border-radius: 0.375rem; color: #fff; background-color: #2563eb; }
  .btn-primary:hover{ background-color: #1d4ed8; }
  .btn-secondary{ padding: 0.5rem 0.75rem; border-radius: 0.375rem; border: 1px solid rgba(156,163,175,0.6); }
  .btn-danger{ padding: 0.5rem 0.75rem; border-radius: 0.375rem; color: #fff; background-color: #dc2626; }
  .btn-danger:hover{ background-color: #b91c1c; }
  .input{ padding: 0.5rem 0.75rem; border: 1px solid rgba(156,163,175,0.6); border-radius: 0.375rem; }
</style>


