// Local storage (no server / no DB). Keeps a tiny schema with versioning.
const KEY = 'offline_tent_manager_v1'

function uuid() {
  // Simple UUID v4-ish
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const blank = () => ({
  schemaVersion: 1,
  units: [],       // {id, type: 'tent'|'spot', name, createdAt, updatedAt, isDeleted:false}
  bookings: []     // {id, unitId, guestName, startDate, endDate, isActive:true, createdAt, updatedAt, endedAt?}
})

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return blank()
    const parsed = JSON.parse(raw)
    if (!parsed.schemaVersion) return blank()
    return parsed
  } catch {
    return blank()
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function exportState() {
  return JSON.stringify(loadState(), null, 2)
}

export function importState(json) {
  const obj = JSON.parse(json)
  if (!obj || typeof obj !== 'object') throw new Error('Invalid JSON')
  if (!obj.schemaVersion) obj.schemaVersion = 1
  localStorage.setItem(KEY, JSON.stringify(obj))
}

export function createUnit({ type, name }) {
  const s = loadState()
  const now = new Date().toISOString()
  s.units.push({ id: uuid(), type, name, createdAt: now, updatedAt: now, isDeleted: false })
  saveState(s)
  return s
}

export function updateUnit(id, patch) {
  const s = loadState()
  const u = s.units.find(x => x.id === id && !x.isDeleted)
  if (!u) return s
  Object.assign(u, patch)
  u.updatedAt = new Date().toISOString()
  saveState(s)
  return s
}

export function deleteUnit(id) {
  const s = loadState()
  const u = s.units.find(x => x.id === id && !x.isDeleted)
  if (!u) return s
  u.isDeleted = true
  u.updatedAt = new Date().toISOString()
  // End any active booking for this unit
  s.bookings.forEach(b => {
    if (b.unitId === id && b.isActive) {
      b.isActive = false
      b.endedAt = new Date().toISOString()
      b.updatedAt = new Date().toISOString()
    }
  })
  saveState(s)
  return s
}

export function activeBookingForUnit(unitId) {
  const s = loadState()
  return s.bookings.find(b => b.unitId === unitId && b.isActive)
}

export function createBooking({ unitId, guestName, startDate, endDate }) {
  const s = loadState()
  const now = new Date().toISOString()
  // ensure single active booking per unit
  s.bookings.forEach(b => {
    if (b.unitId === unitId && b.isActive) {
      b.isActive = false
      b.endedAt = now
      b.updatedAt = now
    }
  })
  s.bookings.push({
    id: uuid(), unitId, guestName, startDate, endDate,
    isActive: true, createdAt: now, updatedAt: now
  })
  saveState(s)
  return s
}

export function extendBooking(bookingId, newEndDate) {
  const s = loadState()
  const b = s.bookings.find(x => x.id === bookingId)
  if (!b || !b.isActive) return s
  b.endDate = newEndDate
  b.updatedAt = new Date().toISOString()
  saveState(s)
  return s
}

export function freeUnit(unitId) {
  const s = loadState()
  const now = new Date().toISOString()
  s.bookings.forEach(b => {
    if (b.unitId === unitId && b.isActive) {
      b.isActive = false
      b.endedAt = now
      b.updatedAt = now
    }
  })
  saveState(s)
  return s
}
