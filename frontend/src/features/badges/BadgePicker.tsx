import { useCallback } from 'react'
import { Button } from '@maxhub/max-ui'
import { Check } from 'lucide-react'
import { useSession } from '../session/context'
import { useResource } from '../../shared/api/useResource'
import { loadBadgeCatalog } from './api'

export function BadgePicker({
  value,
  studentFriendly,
  onChange,
  error,
}: {
  value: string
  studentFriendly: boolean
  onChange: (keys: string[], student: boolean) => void
  error?: string
}) {
  const { mode } = useSession()
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (import.meta.env.DEV && mode === 'preview')
        return (await import('../../mocks/badges')).previewBadgeCatalog
      return loadBadgeCatalog(signal)
    },
    [mode],
  )
  const { result, reload } = useResource(load, 'badge-catalog')
  const selected = new Set([
    ...value.split(',').filter(Boolean),
    ...(studentFriendly ? ['students_ok'] : []),
  ])
  return (
    <section className="badge-picker" aria-label="Бейджи вакансии">
      <div className="badge-picker-heading">
        <h3>Что вы предлагаете</h3>
        <span>
          {selected.size} / {result.state === 'ready' ? result.data.maxPerVacancy : 4}
        </span>
      </div>
      <p className="field-hint">
        Выберите до 4 преимуществ, включая отметку для студентов. Они появятся в карточке вакансии.
      </p>
      {result.state === 'loading' && <p role="status">Загружаем условия…</p>}
      {result.state === 'error' && (
        <div role="alert">
          <p>Не удалось загрузить бейджи. Уже выбранные условия сохранятся.</p>
          <Button variant="secondary" type="button" onClick={reload}>
            Повторить
          </Button>
        </div>
      )}
      {result.state === 'ready' &&
        result.data.groups.map((group) => (
          <div className="badge-picker-group" key={group.key}>
            <h4>
              {group.emoji} {group.label}
            </h4>
            <div>
              {group.items.map((badge) => (
                <Button
                  key={badge.key}
                  type="button"
                  variant="secondary"
                  className="badge-choice"
                  aria-pressed={selected.has(badge.key)}
                  disabled={!selected.has(badge.key) && selected.size >= result.data.maxPerVacancy}
                  onClick={() => {
                    const next = new Set(selected)
                    if (next.has(badge.key)) next.delete(badge.key)
                    else next.add(badge.key)
                    onChange([...next], next.has('students_ok'))
                  }}
                  iconAfter={selected.has(badge.key) ? <Check size={14} /> : undefined}
                >
                  {badge.emoji} {badge.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  )
}
