export function isToday(dateStr: string): boolean {
  const d = new Date(dateStr); const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

export function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr); const t = new Date(); t.setDate(t.getDate() + 1)
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

export function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr).getTime(); const now = Date.now()
  return d >= now && d <= now + days * 86400000
}

export function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr); const y = new Date(); y.setDate(y.getDate() - 1)
  return d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()
}

function isWithinPastDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr).getTime(); const now = Date.now()
  return d <= now && d >= now - days * 86400000
}

function getDateGroup(dateStr: string): string {
  if (isToday(dateStr)) return 'today'
  if (isYesterday(dateStr)) return 'yesterday'
  if (isWithinPastDays(dateStr, 7)) return 'thisWeek'
  return 'earlier'
}
