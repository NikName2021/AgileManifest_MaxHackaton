export function formatPublicationDate(value: string, now = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Дата не указана'

  // Compare local calendar days, including month/year and daylight-saving boundaries.
  if (date.toDateString() === now.toDateString()) return 'Сегодня'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера'

  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
    .formatToParts(date)
    .map((part) =>
      part.type === 'month' ? part.value[0].toUpperCase() + part.value.slice(1) : part.value,
    )
    .join('')
}
