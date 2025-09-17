// Centralized notifications store
// Design: groups of notifications with stable keys, per-source replacement,
// read/unread persistence, and helpers for UI surfaces.

import { writable, derived, get } from 'svelte/store'

// Local storage keys
const READ_KEYS_STORAGE = 'nw_alerts_read_keys'

function loadReadKeys() {
  try {
    const raw = localStorage.getItem(READ_KEYS_STORAGE)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return new Set(arr)
  } catch {}
  return new Set()
}

function persistReadKeys(set) {
  try {
    localStorage.setItem(READ_KEYS_STORAGE, JSON.stringify(Array.from(set)))
  } catch {}
}

// Group shape
// {
//   key: string,                // stable identifier (e.g., 'overlap:hard')
//   title: string,
//   description?: string,
//   severity: 'hard'|'soft',
//   items: Array<{ id: number, name: string, time: string, server?: string, warType?: string, character?: string }>,
//   source: string,             // e.g., 'war'
//   createdAt?: string,         // ISO
//   expiresAt?: string          // ISO (optional)
// }

const readKeysStore = writable(loadReadKeys())

// All groups across sources
const groupsStore = writable([])

// Derived slices
export const allNotifications = groupsStore

export const unreadCount = derived([groupsStore, readKeysStore], ([$groups, $read]) => {
  return ($groups || []).reduce((acc, g) => acc + ($read.has(g.key) ? 0 : 1), 0)
})

// Convenience channel slice for war alerts
export const warAlerts = derived(groupsStore, ($groups) => ($groups || []).filter(g => g.source === 'war'))
export const warUnreadCount = derived([warAlerts, readKeysStore], ([$war, $read]) => ($war || []).reduce((acc, g) => acc + ($read.has(g.key) ? 0 : 1), 0))

export const readKeys = derived(readKeysStore, ($s) => $s)

// API: replace groups for a given source (e.g., snapshot polling update)
export function replaceSourceGroups(source, newGroups) {
  groupsStore.update((current) => {
    const rest = (current || []).filter(g => g.source !== source)
    // Normalize incoming groups
    const normalized = (newGroups || []).map(g => ({
      ...g,
      source,
    }))
    return [...rest, ...normalized]
  })
}

export function markGroupRead(key) {
  if (!key) return
  const next = new Set(get(readKeysStore))
  next.add(key)
  readKeysStore.set(next)
  persistReadKeys(next)
}

export function markGroupUnread(key) {
  if (!key) return
  const next = new Set(get(readKeysStore))
  next.delete(key)
  readKeysStore.set(next)
  persistReadKeys(next)
}

export function markAllUnread() {
  const next = new Set()
  readKeysStore.set(next)
  persistReadKeys(next)
}

export function getReadKeys() {
  return new Set(get(readKeysStore))
}

// Optional: purge expired groups (call periodically)
export function purgeExpired(nowIso = new Date().toISOString()) {
  const now = new Date(nowIso).getTime()
  groupsStore.update((current) => (current || []).filter(g => {
    if (!g.expiresAt) return true
    const t = new Date(g.expiresAt).getTime()
    return Number.isFinite(t) ? t > now : true
  }))
}


