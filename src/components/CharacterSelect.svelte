<script>
  import { onMount } from 'svelte'
  import FactionIcon from './FactionIcon.svelte'
  import appIcon from '../../assets/icon.ico'

  export let characters = []
  export let value = '' // id or ''
  export let placeholder = 'Select character'
  export let disabled = false
  export let fullWidth = true
  export let includeAll = false
  export let allLabel = 'All Characters'

  let open = false
  let search = ''
  let buttonEl
  let listEl

  $: selected = characters.find(c => (c.id == value))
  $: isAll = includeAll && value === 'all'
  $: filtered = characters.filter(c => c.name.toLowerCase().includes((search||'').toLowerCase()))

  function toggle() { if (!disabled) open = !open }
  function close() { open = false; search = '' }
  function onKey(e) {
    if (e.key === 'Escape') { close(); buttonEl?.focus() }
    if (e.key === 'Enter' && open && filtered.length>0) { select(filtered[0]) }
  }
  function select(c){ value = c?.id ?? ''; close(); buttonEl?.focus(); dispatchChange() }
  function dispatchChange(){ const evt = new CustomEvent('change', { detail: { value } }); dispatchEvent(evt) }

  // Expose a change event
  function dispatchEvent(e){ componentEl?.dispatchEvent(e) }
  let componentEl
</script>

<div bind:this={componentEl} class={`relative ${fullWidth ? 'w-full' : ''}`} on:keydown={onKey} role="combobox" aria-haspopup="listbox" aria-expanded={open}>
  <button bind:this={buttonEl} type="button" class="w-full inline-flex items-center justify-between border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-base text-gray-800 dark:text-gray-100" aria-haspopup="listbox" aria-expanded={open} on:click={toggle} disabled={disabled}>
    <span class="flex items-center gap-2 overflow-hidden text-ellipsis">
      {#if isAll}
        <img src={appIcon} alt="All" class="w-5 h-5" />
        <span class="truncate">{allLabel}</span>
      {:else if selected}
        <FactionIcon faction={selected.faction} size={18} />
        <span class="truncate">{selected.name}</span>
      {:else}
        <img src={appIcon} alt="icon" class="w-5 h-5" />
        <span class="text-gray-500">{placeholder}</span>
      {/if}
    </span>
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="ml-2 text-gray-500"><polyline points="6 8 10 12 14 8"/></svg>
  </button>

  {#if open}
  <div class="absolute z-50 mt-1 w-full max-h-56 overflow-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
    <div class="p-2">
      <input type="text" placeholder="Search…" bind:value={search} class="w-full text-base px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
    </div>
    <ul bind:this={listEl} role="listbox" tabindex="-1" class="py-1">
      {#if includeAll}
        <li role="option" aria-selected={value==='all'} tabindex="0" class="px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-base" on:click={() => { value='all'; close(); buttonEl?.focus(); dispatchChange() }} on:keydown={(e)=>{ if(e.key==='Enter' || e.key===' ') { value='all'; close(); buttonEl?.focus(); dispatchChange() } }}>
          <img src={appIcon} alt="All" class="w-5 h-5" />
          <span class="truncate">{allLabel}</span>
        </li>
      {/if}
      {#if filtered.length === 0}
        <li class="px-2 py-1 text-sm text-gray-500">No results</li>
      {/if}
      {#each filtered as c}
        <li role="option" aria-selected={c.id==value} tabindex="0" class="px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-base" on:click={() => select(c)} on:keydown={(e)=>{ if(e.key==='Enter' || e.key===' ') { select(c) } }}>
          <FactionIcon faction={c.faction} size={18} />
          <span class="truncate">{c.name} <span class="text-xs text-gray-500">({c.server_name})</span></span>
        </li>
      {/each}
    </ul>
  </div>
  {/if}
</div>


