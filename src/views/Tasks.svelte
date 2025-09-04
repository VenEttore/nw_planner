<script>
  import { onMount, onDestroy } from 'svelte'
  import api from '../services/api.js'
  import TaskModal from '../components/TaskModal.svelte'
  import FactionIcon from '../components/FactionIcon.svelte'
  import BatchAssignModal from '../components/BatchAssignModal.svelte'
  
  let loading = true
  let tasks = []
  let error = null
  let showModal = false
  let editingTask = null
  
  // Characters and their assigned tasks (with completion status)
  let characters = []
  let charactersLoading = true
  let characterTasks = {} // { [characterId]: TaskWithStatus[] }
  let characterRowEl = null
  
  // Reset-timer integrations to auto-refresh on resets
  let serverTimerIds = new Map() // serverName -> timerId
  let prevWeeklyMsByServer = new Map() // serverName -> last weekly ms
  
  // Task Library filter
  let taskFilter = 'all' // 'all' | 'daily' | 'weekly' | 'one-time'
  $: filteredTasks = taskFilter === 'all' ? tasks : tasks.filter(t => t.type === taskFilter)
  $: dailyCount = tasks.filter(t => t.type === 'daily').length
  $: weeklyCount = tasks.filter(t => t.type === 'weekly').length
  $: oneTimeCount = tasks.filter(t => t.type === 'one-time').length
  
  function tabClasses(val) {
    const active = val === taskFilter
    const base = 'px-3 py-1 text-sm rounded-md border transition-colors'
    return active
      ? base + ' bg-nw-blue text-white border-nw-blue'
      : base + ' bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
  }

  function smallBtn(variant) {
    const base = 'px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
    if (variant === 'primary') return base + ' text-white bg-nw-blue hover:bg-nw-blue-dark'
    if (variant === 'secondary') return base + ' text-white bg-gray-600 hover:bg-gray-700'
    if (variant === 'danger') return base + ' text-white bg-red-600 hover:bg-red-700'
    return base
  }
  
  onMount(async () => {
    await Promise.all([loadTasks(), loadCharactersAndTasks()])
    startServerTimers()
  })
  
  onDestroy(() => {
    stopServerTimers()
  })
  
  async function loadTasks() {
    loading = true
    error = null
    try {
      tasks = await api.getTasks()
    } catch (err) {
      console.error('Error loading tasks:', err)
      error = 'Failed to load tasks. Please try again.'
    } finally {
      loading = false
    }
  }
  
  async function loadCharactersAndTasks() {
    charactersLoading = true
    try {
      characters = await api.getActiveCharacters()
      const map = {}
      for (const c of characters) {
        try {
          map[c.id] = await api.getCharacterTasks(c.id)
        } catch (err) {
          console.error('Error loading character tasks:', c, err)
          map[c.id] = []
        }
      }
      characterTasks = map
      // Restart timers when character set changes
      startServerTimers()
    } catch (err) {
      console.error('Error loading characters:', err)
      characters = []
      characterTasks = {}
    } finally {
      charactersLoading = false
    }
  }

  function startServerTimers() {
    // Collect unique server names from active characters
    const servers = Array.from(new Set(characters.map(c => c.server_name).filter(Boolean)))
    const current = new Set(servers)
    // Stop timers for servers no longer present
    for (const [server, id] of serverTimerIds) {
      if (!current.has(server)) {
        api.stopResetTimer(id)
        serverTimerIds.delete(server)
        prevWeeklyMsByServer.delete(server)
      }
    }
    // Start timers for new servers
    for (const server of servers) {
      if (serverTimerIds.has(server)) continue
      api.startResetTimer(server, (data) => {
        try {
          const prev = prevWeeklyMsByServer.has(server) ? prevWeeklyMsByServer.get(server) : Number.POSITIVE_INFINITY
          prevWeeklyMsByServer.set(server, data.weekly?.totalMs ?? prev)
          const crossed = prev > 1000 && (data.weekly?.totalMs ?? 0) <= 1000
          if (crossed) {
            // Reload tasks for characters on this server once per reset crossing
            refreshCharactersOnServer(server)
          }
        } catch (e) {
          console.error('Timer callback error for server', server, e)
        }
      }).then((timerId) => {
        if (timerId) serverTimerIds.set(server, timerId)
      }).catch(err => console.error('Failed to start timer for', server, err))
    }
  }

  async function refreshCharactersOnServer(serverName) {
    const ids = characters.filter(c => c.server_name === serverName).map(c => c.id)
    const updates = await Promise.all(ids.map(async (id) => {
      try { return [id, await api.getCharacterTasks(id)] } catch (_) { return [id, characterTasks[id] || []] }
    }))
    const map = { ...characterTasks }
    for (const [id, tasks] of updates) {
      map[id] = tasks
    }
    characterTasks = map
  }

  function stopServerTimers() {
    for (const [, id] of serverTimerIds) {
      api.stopResetTimer(id)
    }
    serverTimerIds.clear()
    prevWeeklyMsByServer.clear()
  }

  function openCreate() {
    editingTask = null
    showModal = true
  }

  function openEdit(task) {
    editingTask = task
    showModal = true
  }

  async function handleSave(event) {
    const data = event.detail
    try {
      if (editingTask) {
        // Update task then assignments
        const { assignments, ...taskData } = data
        const updated = await api.updateTask(editingTask.id, taskData)
        if (assignments) {
          await api.setTaskAssignments(editingTask.id, assignments)
        }
      } else {
        // Create task then assignments
        const { assignments, ...taskData } = data
        const created = await api.createTask(taskData)
        if (created?.id && assignments) {
          await api.setTaskAssignments(created.id, assignments)
        }
      }
      showModal = false
      editingTask = null
      await Promise.all([loadTasks(), loadCharactersAndTasks()])
    } catch (err) {
      console.error('Error saving task:', err)
    }
  }

  async function handleDelete(event) {
    const id = event.detail
    try {
      await api.deleteTask(id)
      showModal = false
      editingTask = null
      await Promise.all([loadTasks(), loadCharactersAndTasks()])
    } catch (err) {
      console.error('Error deleting task:', err)
    }
  }
  
  async function toggleCharacterTask(characterId, task) {
    try {
      if (task.completed) {
        await api.markTaskIncomplete(task.id, characterId, task.resetPeriod)
      } else {
        await api.markTaskComplete(task.id, characterId, task.resetPeriod)
      }
      // Reload just this character's tasks
      const updated = await api.getCharacterTasks(characterId)
      characterTasks = { ...characterTasks, [characterId]: updated }
    } catch (err) {
      console.error('Error toggling character task:', err)
    }
  }

  function handleCharacterWheel(event) {
    const el = characterRowEl
    if (!el) return
    const canScrollHorizontally = el.scrollWidth > el.clientWidth
    if (!canScrollHorizontally) return
    // Convert vertical wheel to horizontal scroll within the row
    if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
      el.scrollLeft += event.deltaY
      event.preventDefault()
    }
  }

  async function deleteTaskItem(task) {
    try {
      const { showConfirm } = await import('../stores/dialog.js')
      const confirmed = await showConfirm(`Delete task "${task.name}"?`, 'Delete Task', 'Delete', 'Cancel')
      if (!confirmed) return
      await api.deleteTask(task.id)
      await Promise.all([loadTasks(), loadCharactersAndTasks()])
    } catch (err) {
      console.error('Error deleting task:', err)
    }
  }

  // Batch selection & actions
  let selectedTaskIds = []
  let showBatchAssign = false
  
  function isSelected(taskId) { return selectedTaskIds.includes(taskId) }
  function clearSelection() { selectedTaskIds = [] }
  function selectAllVisible() {
    const ids = filteredTasks.map(t => t.id)
    const allSelected = ids.length > 0 && ids.every(id => selectedTaskIds.includes(id))
    selectedTaskIds = allSelected ? [] : ids
  }
  
  async function batchDelete() {
    if (selectedTaskIds.length === 0) return
    const { showConfirm } = await import('../stores/dialog.js')
    const confirmed = await showConfirm(`Delete ${selectedTaskIds.length} selected task(s)?`, 'Delete Selected', 'Delete', 'Cancel')
    if (!confirmed) return
    try {
      for (const id of selectedTaskIds) {
        await api.deleteTask(id)
      }
      clearSelection()
      await Promise.all([loadTasks(), loadCharactersAndTasks()])
    } catch (err) {
      console.error('Batch delete failed:', err)
    }
  }
  
  async function handleBatchAssign(characterIds) {
    try {
      for (const taskId of selectedTaskIds) {
        // Additive assignment: do not remove existing characters
        await api.assignTaskToCharacters(taskId, characterIds)
      }
      showBatchAssign = false
      clearSelection()
      await Promise.all([loadTasks(), loadCharactersAndTasks()])
    } catch (err) {
      console.error('Batch assign failed:', err)
    }
  }
</script>

<div class="max-w-7xl mx-auto min-w-0">
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Tasks</h1>
    <p class="text-gray-600 dark:text-gray-400">Manage your daily and weekly tasks.</p>
  </div>

  <!-- Row 1: Character Cards (horizontal scroll) -->
  <div class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Assigned Tasks by Character</h2>
      <div class="flex items-center gap-2">
        <button class={smallBtn('secondary')} title="Manually reset daily completions" on:click={async ()=>{ try { await api.manualResetTasks('daily'); await loadCharactersAndTasks() } catch(e){ console.error(e)} }}>Reset Daily</button>
        <button class={smallBtn('secondary')} title="Manually reset weekly completions" on:click={async ()=>{ try { await api.manualResetTasks('weekly'); await loadCharactersAndTasks() } catch(e){ console.error(e)} }}>Reset Weekly</button>
      </div>
    </div>
    {#if charactersLoading}
      <div class="flex items-center justify-center h-32">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-nw-blue"></div>
      </div>
    {:else if characters.length === 0}
      <div class="text-center text-gray-600 dark:text-gray-400">No active characters. Create a character to begin assigning tasks.</div>
    {:else}
      <div class="overflow-x-auto min-w-0" bind:this={characterRowEl} on:wheel={handleCharacterWheel}>
        <div class="flex gap-4 w-max">
        {#each characters as c}
          <div class="w-72 shrink-0 card">
            <div class="flex items-center justify-between mb-2">
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <FactionIcon faction={c.faction} size={16} />
                  {c.name}
                </h3>
                <p class="text-xs text-gray-500 dark:text-gray-400">{c.server_name}</p>
              </div>
            </div>
            {#if (characterTasks[c.id] || []).length === 0}
              <div class="text-sm text-gray-500 dark:text-gray-400">No tasks assigned</div>
            {:else}
              <!-- Dailies -->
              <div class="mb-3">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Daily</div>
                <div class="space-y-2">
                  {#each (characterTasks[c.id] || []).filter(t => t.type === 'daily') as t}
                    <div class="flex items-center justify-between">
                      <label class="flex items-center space-x-2">
                        <input type="checkbox" checked={t.completed} on:change={() => toggleCharacterTask(c.id, t)} class="w-4 h-4 text-nw-blue border-gray-300 rounded focus:ring-nw-blue dark:bg-gray-700 dark:border-gray-600" />
                        <span class="text-sm text-gray-900 dark:text-gray-100 {t.completed ? 'line-through opacity-60' : ''}">{t.name}</span>
                      </label>
                      <span class="text-xs priority-{t.priority.toLowerCase()}">{t.priority}</span>
                    </div>
                  {/each}
                </div>
              </div>
              <!-- Weeklies -->
              <div>
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Weekly</div>
                <div class="space-y-2">
                  {#each (characterTasks[c.id] || []).filter(t => t.type === 'weekly') as t}
                    <div class="flex items-center justify-between">
                      <label class="flex items-center space-x-2">
                        <input type="checkbox" checked={t.completed} on:change={() => toggleCharacterTask(c.id, t)} class="w-4 h-4 text-nw-blue border-gray-300 rounded focus:ring-nw-blue dark:bg-gray-700 dark:border-gray-600" />
                        <span class="text-sm text-gray-900 dark:text-gray-100 {t.completed ? 'line-through opacity-60' : ''}">{t.name}</span>
                      </label>
                      <span class="text-xs priority-{t.priority.toLowerCase()}">{t.priority}</span>
                    </div>
                  {/each}
                </div>
              </div>
              <!-- One-time -->
              {#if (characterTasks[c.id] || []).some(t => t.type === 'one-time')}
              <div class="mt-3">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">One-time</div>
                <div class="space-y-2">
                  {#each (characterTasks[c.id] || []).filter(t => t.type === 'one-time') as t}
                    <div class="flex items-center justify-between">
                      <label class="flex items-center space-x-2">
                        <input type="checkbox" checked={t.completed} on:change={() => toggleCharacterTask(c.id, t)} class="w-4 h-4 text-nw-blue border-gray-300 rounded focus:ring-nw-blue dark:bg-gray-700 dark:border-gray-600" />
                        <span class="text-sm text-gray-900 dark:text-gray-100 {t.completed ? 'line-through opacity-60' : ''}">{t.name}</span>
                      </label>
                      <span class="text-xs priority-{t.priority.toLowerCase()}">{t.priority}</span>
                    </div>
                  {/each}
                </div>
              </div>
              {/if}
            {/if}
          </div>
        {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Row 2: Master Task Library (vertical scroll) -->
  <div class="mb-4 flex items-center justify-between">
    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Task Library</h2>
    <div class="flex items-center gap-3 flex-wrap">
      <div class="flex items-center gap-1">
        <button class={tabClasses('all')} on:click={() => taskFilter = 'all'}>All ({tasks.length})</button>
        <button class={tabClasses('daily')} on:click={() => taskFilter = 'daily'}>Daily ({dailyCount})</button>
        <button class={tabClasses('weekly')} on:click={() => taskFilter = 'weekly'}>Weekly ({weeklyCount})</button>
        <button class={tabClasses('one-time')} on:click={() => taskFilter = 'one-time'}>One-time ({oneTimeCount})</button>
      </div>
      <div class="space-x-2">
        <button class={smallBtn('secondary')} on:click={async () => { await api.initializeDefaultTasks(); await Promise.all([loadTasks(), loadCharactersAndTasks()]) }}>Import Defaults</button>
        <button class={smallBtn('primary')} on:click={openCreate}>Add New Task</button>
      </div>
    </div>
  </div>

  <div class="mb-3 rounded-md border border-blue-200 dark:border-gray-700 bg-blue-50 dark:bg-gray-800/60 px-3 py-2 flex items-center justify-between">
    <div class="text-xs text-blue-900 dark:text-gray-200 font-medium">Selected: {selectedTaskIds.length} / {filteredTasks.length}</div>
    <div class="flex items-center gap-2">
      <button class={smallBtn('secondary')} on:click={() => { if (selectedTaskIds.length>0) showBatchAssign = true }} disabled={selectedTaskIds.length === 0}>Assign to Characters</button>
      <button class={smallBtn('danger')} on:click={batchDelete} disabled={selectedTaskIds.length === 0}>Delete Selected</button>
      <button class="px-2 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600" on:click={clearSelection} disabled={selectedTaskIds.length === 0}>Clear</button>
      <button class="px-2 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600" on:click={selectAllVisible} disabled={filteredTasks.length === 0}>Select All</button>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-40">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-nw-blue"></div>
    </div>
  {:else if error}
    <div class="text-center py-8">
      <div class="text-red-600 dark:text-red-400 mb-4">{error}</div>
      <button on:click={() => Promise.all([loadTasks(), loadCharactersAndTasks()])} class="btn btn-primary">
        Try Again
      </button>
    </div>
  {:else}
    <div class="max-h-[60vh] overflow-y-auto space-y-2">
      {#if filteredTasks.length === 0}
        <div class="text-center text-gray-600 dark:text-gray-400 py-8">No tasks found.</div>
      {:else}
        {#each filteredTasks as task}
          <div class="border border-gray-200 dark:border-gray-700 rounded px-3 py-2 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <input type="checkbox" bind:group={selectedTaskIds} value={task.id} class="w-4 h-4 text-nw-blue border-gray-300 rounded focus:ring-nw-blue dark:bg-gray-700 dark:border-gray-600" />
            </div>
            <div class="min-w-0 flex-1 ml-2">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[32rem]">{task.name}</h3>
                <span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{task.type}</span>
                <span class="text-xs priority-{task.priority.toLowerCase()}">{task.priority}</span>
              </div>
              {#if task.description}
                <p class="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[48rem]">{task.description}</p>
              {/if}
            </div>
            <div class="flex items-center gap-2 ml-4 flex-shrink-0">
              <button class="btn-secondary text-xs" on:click={() => openEdit(task)}>Edit</button>
              <button class="btn-danger text-xs" on:click={() => deleteTaskItem(task)}>Delete</button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <TaskModal isOpen={showModal} task={editingTask} on:save={handleSave} on:delete={handleDelete} on:close={() => { showModal = false; editingTask = null }} />
  <BatchAssignModal isOpen={showBatchAssign} selectedTaskCount={selectedTaskIds.length} on:assign={(e) => handleBatchAssign(e.detail)} on:close={() => { showBatchAssign = false }} />
</div> 