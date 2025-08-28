import api from './api.js'

// Update RSVP consistently and reconcile current views' local lists.
// patchers: array of functions (eventId, freshEvent) => void to patch view-local arrays
export async function updateEventStatus(eventId, nextName, patchers = []) {
  // 1) Save first (avoid committing optimistic state that could be reverted on error)
  await api.updateEventRsvp(eventId, nextName)
  // 2) Fetch fresh row and patch view state precisely
  let fresh = null
  try { fresh = await api.getEventById(eventId) } catch {}
  if (!fresh) return
  for (const patch of patchers) {
    try { patch(eventId, fresh) } catch {}
  }
}


