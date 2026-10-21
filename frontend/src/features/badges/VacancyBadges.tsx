import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { displayedBadges, type VacancyBadge } from './api'
import { scheduleLabels } from '../vacancies/model'
import type { Vacancy } from '../../entities/hiring'

export function VacancyBadges({
  job,
  detailed = false,
}: {
  job: Pick<Vacancy, 'schedule' | 'category' | 'badges' | 'studentFriendly'>
  detailed?: boolean
}) {
  const perks = displayedBadges(job.badges, job.studentFriendly)
  const items: VacancyBadge[] = [
    { key: 'employment', emoji: '🗓️', label: scheduleLabels[job.schedule] },
    ...(job.category && job.category !== 'general'
      ? [{ key: 'category', emoji: '', label: job.category }]
      : []),
    ...perks,
  ]
  const [expanded, setExpanded] = useState(false),
    [visibleCount, setVisibleCount] = useState(items.length)
  const measurement = useRef<HTMLDivElement>(null)
  const signature = JSON.stringify(items)
  useLayoutEffect(() => {
    const element = measurement.current
    if (!element) return
    const measure = () => {
      const chips = [...element.children] as HTMLElement[]
      const rows = [...new Set(chips.map((chip) => chip.offsetTop))]
      if (rows.length <= 2) {
        setVisibleCount(chips.length)
        return
      }
      const secondRow = rows[1]
      let count = chips.findIndex((chip) => chip.offsetTop > secondRow)
      while (
        count > 1 &&
        chips[count - 1].offsetTop === secondRow &&
        chips[count - 1].offsetLeft + chips[count - 1].offsetWidth > element.clientWidth - 48
      )
        count--
      setVisibleCount(Math.max(1, count))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [signature])
  const overflow = visibleCount < items.length
  return (
    <div className={`vacancy-badges ${detailed ? 'detailed' : ''}`}>
      <div className="badge-measure" ref={measurement} aria-hidden="true">
        {items.map((item) => (
          <span key={item.key} className="vacancy-badge">
            {item.emoji && <span>{item.emoji}</span>}
            {item.label}
          </span>
        ))}
      </div>
      <div className="badge-list" aria-label="Условия вакансии">
        {(expanded ? items : items.slice(0, visibleCount)).map((item) => (
          <span key={item.key} className="vacancy-badge" title={item.label}>
            {item.emoji && <span aria-hidden="true">{item.emoji}</span>}
            {item.label}
          </span>
        ))}
        {overflow && (
          <Button
            type="button"
            variant="ghost"
            className="badges-expand"
            aria-label={expanded ? 'Скрыть дополнительные бейджи' : 'Показать все бейджи'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </Button>
        )}
      </div>
    </div>
  )
}
