export function displayDate(value: string, now = new Date(), timeZone?: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const relative = day(date) === day(now) ? 'Сегодня' : day(date) === day(yesterday) ? 'Вчера' : ''
  return relative
    ? `${relative}, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone })}`
    : date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        timeZone,
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
      })
}
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((v) => v[0])
    .join('')
    .toLocaleUpperCase('ru')
}
