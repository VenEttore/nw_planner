<script>
  import covenant from '../../assets/covenant.png'
  import marauders from '../../assets/marauders.png'
  import syndicate from '../../assets/syndicate.png'
  import appIcon from '../../assets/icon.ico'

  export let faction = 'Factionless'
  export let size = 16
  export let className = ''

  function getSrc(f) {
    if (!f) return appIcon
    const key = f.toLowerCase()
    if (key === 'marauders') return marauders
    if (key === 'covenant') return covenant
    if (key === 'syndicate') return syndicate
    return appIcon
  }

  $: src = getSrc(faction)
</script>

<img src={src} alt={(faction || 'Factionless') + ' icon'} width={size} height={size} class={className} />


