<script>
  import { onMount } from 'svelte'
  import api from '../services/api.js'
  import CharacterModal from '../components/CharacterModal.svelte'
  import SteamAccountManager from '../components/SteamAccountManager.svelte'
  import FactionIcon from '../components/FactionIcon.svelte'
  
  let loading = true
  let characters = []
  let showModal = false
  let editingCharacter = null
  let showSteamManager = false
  
  onMount(async () => {
    await loadCharacters()
  })
  
  async function loadCharacters() {
    loading = true
    try {
      characters = await api.getCharacters()
    } catch (error) {
      console.error('Error loading characters:', error)
    } finally {
      loading = false
    }
  }

  function openSteamManager() {
    showSteamManager = true
  }
  

  
  function openCreateModal() {
    editingCharacter = null
    showModal = true
  }
  
  function openEditModal(character) {
    editingCharacter = character
    showModal = true
  }
  
  async function handleCharacterSaved(event) {
    const savedCharacter = event.detail
    console.log('Character saved:', savedCharacter)
    
    // Reload characters to get updated data
    await loadCharacters()
  }
  
  async function toggleActiveStatus(character) {
    try {
      await api.updateCharacterActiveStatus(character.id, !character.active_status)
      await loadCharacters()
    } catch (error) {
      console.error('Error updating character status:', error)
    }
  }
  
  async function deleteCharacter(character) {
    const { showConfirm } = await import('../stores/dialog.js')
    const ok = await showConfirm(`Are you sure you want to delete ${character.name}?`, 'Delete Character', 'Delete', 'Cancel')
    if (!ok) return
    try {
      await api.deleteCharacter(character.id)
      await loadCharacters()
    } catch (error) {
      console.error('Error deleting character:', error)
    }
  }
</script>

<div class="max-w-7xl mx-auto">
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Characters</h1>
    <p class="text-gray-600 dark:text-gray-400">Manage your New World characters.</p>
  </div>
  
  {#if loading}
    <div class="flex items-center justify-center h-64">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-nw-blue"></div>
    </div>
  {:else}
    <div class="mb-6">
      <div class="flex gap-2">
        <button class="btn-primary" on:click={openCreateModal}>Add New Character</button>
        <button class="btn-secondary" on:click={openSteamManager}>Manage Steam Accounts</button>
      </div>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each characters as character}
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FactionIcon faction={character.faction} size={18} />
              {character.name}
            </h3>
            <div class="flex items-center space-x-2">
              <button
                on:click={() => toggleActiveStatus(character)}
                class="text-xs px-2 py-1 rounded-full {character.active_status ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}"
              >
                {character.active_status ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
          <div class="space-y-2">
            <div class="flex justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Server:</span>
              <span class="text-sm text-gray-900 dark:text-white">{character.server_name}</span>
            </div>
            {#if character.steam_account_id}
            <div class="flex justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Steam:</span>
              <span class="text-sm text-gray-900 dark:text-white">{character.steam_label || 'Linked'}</span>
            </div>
            {/if}
            <div class="flex justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Faction:</span>
              <span class="text-sm faction-{character.faction.toLowerCase()}">{character.faction}</span>
            </div>
            {#if character.company}
              <div class="flex justify-between">
                <span class="text-sm text-gray-600 dark:text-gray-400">Company:</span>
                <span class="text-sm text-gray-900 dark:text-white">{character.company}</span>
              </div>
            {/if}
            {#if character.notes}
              <div class="mt-2">
                <span class="text-sm text-gray-600 dark:text-gray-400">Notes:</span>
                <p class="text-sm text-gray-900 dark:text-white mt-1">{character.notes}</p>
              </div>
            {/if}
          </div>
          <div class="mt-4 flex space-x-2">
            <button 
              class="btn-secondary text-sm" 
              on:click={() => openEditModal(character)}
            >
              Edit
            </button>
            <button 
              class="btn-danger text-sm"
              on:click={() => deleteCharacter(character)}
            >
              Delete
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Character Modal -->
<CharacterModal 
  bind:isOpen={showModal} 
  character={editingCharacter} 
  on:saved={handleCharacterSaved}
/>

<!-- Steam Account Manager -->
<SteamAccountManager bind:isOpen={showSteamManager} on:close={() => showSteamManager=false} />