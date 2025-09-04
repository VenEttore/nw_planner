<script>
  import FactionIcon from './FactionIcon.svelte'
  export let value = 'Factionless'
  export let disabled = false

  const options = ['Factionless', 'Marauders', 'Covenant', 'Syndicate']

  let open = false
  let buttonEl
  let listEl
  let componentEl

  function toggle(){ if (!disabled) open = !open }
  function close(){ open = false }

  function select(opt){ value = opt; close(); buttonEl?.focus() }

  function onKey(e){
    if (disabled) return
    if (e.key === 'Escape') { close(); buttonEl?.focus() }
    if ((e.key === 'Enter' || e.key === ' ') && !open) { e.preventDefault(); open = true }
  }

  function onOptionKey(e, opt){
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(opt) }
    if (e.key === 'Escape') { e.preventDefault(); close(); buttonEl?.focus() }
  }
</script>

<div bind:this={componentEl} class="relative w-full" role="combobox" aria-haspopup="listbox" aria-expanded={open} tabindex="0" on:keydown={onKey}>
  <button bind:this={buttonEl} type="button" class="w-full inline-flex items-center justify-between border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-base text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-nw-blue disabled:opacity-50" on:click={toggle} aria-controls="faction-options" {disabled}>
    <span class="flex items-center gap-2 overflow-hidden text-ellipsis">
      <FactionIcon faction={value} size={18} />
      <span class="truncate">{value}</span>
    </span>
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="ml-2 text-gray-500"><polyline points="6 8 10 12 14 8"/></svg>
  </button>

  {#if open}
  <div class="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
    <ul id="faction-options" bind:this={listEl} role="listbox" tabindex="-1" class="py-1">
      {#each options as opt}
        <li role="option" aria-selected={opt===value} tabindex="0" class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-base text-gray-800 dark:text-gray-100" on:click={() => select(opt)} on:keydown={(e)=> onOptionKey(e,opt)}>
          <FactionIcon faction={opt} size={18} />
          <span class="truncate">{opt}</span>
        </li>
      {/each}
    </ul>
  </div>
  {/if}
</div>


