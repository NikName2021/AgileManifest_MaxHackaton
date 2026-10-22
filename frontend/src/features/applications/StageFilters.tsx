import { Button } from '@maxhub/max-ui'
import { applicationLabels, type ApplicationStatus } from '../../entities/hiring'
import { statuses } from './api'
export function StageFilters({
  value,
  counts,
  onChange,
  disabled = false,
}: {
  value?: ApplicationStatus
  counts?: { total: number | null; stages: Record<ApplicationStatus, number | null> }
  onChange: (value: ApplicationStatus | undefined) => void
  disabled?: boolean
}) {
  if (counts?.total === 0) return null
  return (
    <div className="stage-filters" role="group" aria-label="Фильтр по этапу найма">
      {([undefined, ...statuses] as const).map((s) => {
        const count = s ? counts?.stages[s] : counts?.total
        return (
          <Button
            key={s ?? 'all'}
            variant="secondary"
            className={`filter-chip ${count === 0 ? 'is-zero' : ''}`}
            aria-pressed={s === value}
            disabled={disabled}
            onClick={() => onChange(s)}
          >
            {s ? applicationLabels[s] : 'Все'} · {count ?? '—'}
          </Button>
        )
      })}
    </div>
  )
}
