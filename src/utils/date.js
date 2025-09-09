// Local-date helpers (no libraries)
export const pad2 = (n) => String(n).padStart(2, '0')

// Return YYYY-MM-DD in *local* time for a given Date (or now if omitted)
export function ymd(d = new Date()) {
  const yr = d.getFullYear()
  const mo = pad2(d.getMonth() + 1)
  const da = pad2(d.getDate())
  return `${yr}-${mo}-${da}`
}

// Build a Date at local midnight from 'YYYY-MM-DD'
export function fromYMD(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

// Today at HH:mm (local)
export function todayAt(h = 13, m = 0) {
  const t = new Date()
  t.setHours(h, m, 0, 0)
  return t
}

// Add days to a 'YYYY-MM-DD' string → 'YYYY-MM-DD'
export function addDays(ymdStr, days) {
  const d = fromYMD(ymdStr)
  d.setDate(d.getDate() + days)
  return ymd(d)
}

// Compare two YMD strings in local time
export function cmpYmd(a, b) {
  const da = fromYMD(a).getTime()
  const db = fromYMD(b).getTime()
  return Math.sign(da - db)
}
