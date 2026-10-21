import { formatPublicationDate } from './publicationDate'

export function JobPublicationDate({ value }: { value: string }) {
  const label = formatPublicationDate(value)
  const recent = label === 'Сегодня' || label === 'Вчера'

  if (label === 'Дата не указана') return <span className="publication-date">{label}</span>

  return (
    <time dateTime={value} className={`publication-date${recent ? ' is-recent' : ''}`}>
      Опубликовано {recent ? label.toLowerCase() : label}
    </time>
  )
}
