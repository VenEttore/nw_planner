<script>
  import { createEventDispatcher } from 'svelte'

  export let value = 'Signed Up'
  export let statuses = []
  export let disabled = false
  export let selectClass = ''
  export let stopClickPropagation = false

  const dispatch = createEventDispatcher()

  $: selected = (statuses || []).find(s => s.name === value)
  $: bgClass = selected?.color_bg || 'bg-gray-50 border-gray-200'
  $: textClass = selected?.color_text || 'text-gray-800'

  function handleChange(e) {
    const v = e.target.value
    dispatch('change', { value: v })
  }
  function maybeStop(e) { if (stopClickPropagation) e.stopPropagation() }
</script>

<span class={`inline-flex items-center rounded-md border overflow-hidden ${bgClass} ${textClass}`}>
  <select
    class={`appearance-none bg-transparent border-0 focus:ring-0 outline-none leading-tight ${selectClass} pr-6 pl-2 py-1 bg-[length:12px_12px] bg-no-repeat bg-right-2 bg-[url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 20 20\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 8 10 12 14 8\'/></svg>')]`}
    bind:value
    disabled={disabled}
    on:click={maybeStop}
    on:change={handleChange}
  >
    {#each (statuses && statuses.length ? statuses : [
      { name: 'Signed Up' },
      { name: 'Confirmed' },
      { name: 'Tentative' },
      { name: 'Absent' }
    ]) as s}
      <option value={s.name}>{s.name}</option>
    {/each}
  </select>
</span>


