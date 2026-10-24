import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useSession } from '../session/context'
import { useResource } from '../../shared/api/useResource'
import { Input } from '../../shared/ui/Input'
import { useDebounce } from '../../shared/hooks/useDebounce'
import { loadBadgeCatalog, suggestBadges, type BadgeGroup } from './api'

export function BadgePicker({
  value,
  onChange,
  error,
  onLimit,
}: {
  value: string
  onChange: (keys: string[]) => void
  error?: string
  onLimit?: (limit: number) => void
}) {
  const { mode } = useSession()
  const load = useCallback(
    async (signal: AbortSignal) => {
      const catalog =
        import.meta.env.DEV && mode === 'preview'
          ? (await import('../../mocks/badges')).previewBadgeCatalog
          : await loadBadgeCatalog(signal)
      onLimit?.(catalog.maxPerVacancy)
      return catalog
    },
    [mode, onLimit],
  )
  const { result, reload } = useResource(load, 'badge-catalog')
  const [term, setTerm] = useState('')
  const query = useDebounce(term.trim(), 200)
  const selected = new Set(value.split(',').filter((key) => key && key !== 'students_ok'))
  const exclude = [...selected, 'students_ok'].join(',')
  const search = useCallback(
    (signal: AbortSignal) =>
      query
        ? suggestBadges(query, exclude.split(',').filter(Boolean), mode === 'preview', signal)
        : Promise.resolve([]),
    [query, exclude, mode],
  )
  const suggestions = useResource(search, `badge-suggestions:${query}:${exclude}`)
  const limit = result.state === 'ready' ? result.data.maxPerVacancy : 10
  const all = result.state === 'ready' ? result.data.groups.flatMap((g) => g.items) : []
  function toggle(key: string) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else if (next.size < limit) next.add(key)
    onChange([...next])
  }
  return (
    <section className="badge-picker" aria-label="Бейджи вакансии">
      <div className="badge-picker-heading">
        <h3>Условия и преимущества</h3>
        <span>
          {selected.size} / {limit}
        </span>
      </div>
      <div className="selected-badges">
        {[...selected].map((key) => {
          const badge = all.find((b) => b.key === key)
          return (
            <Button
              type="button"
              variant="secondary"
              className="badge-choice selected"
              aria-label={`Убрать: ${badge?.label ?? key}`}
              key={key}
              onClick={() => toggle(key)}
            >
              {badge?.emoji} {badge?.label ?? key}
              <X size={14} />
            </Button>
          )
        })}
      </div>
      <Input
        aria-label="Поиск условий"
        placeholder="Найти условие: жильё, питание, оплата…"
        maxLength={100}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      {!!term.trim() && (
        <div className="badge-suggestions" aria-live="polite">
          {query !== term.trim() || suggestions.result.state === 'loading' ? (
            <p>Ищем условия…</p>
          ) : suggestions.result.state === 'error' ? (
            <p>
              Не удалось загрузить подсказки.{' '}
              <Button type="button" variant="ghost" onClick={suggestions.reload}>
                Повторить
              </Button>
            </p>
          ) : suggestions.result.data.some(
              (b) => b.key !== 'students_ok' && !selected.has(b.key),
            ) ? (
            suggestions.result.data
              .filter((b) => b.key !== 'students_ok' && !selected.has(b.key))
              .map((b) => (
                <Button
                  key={b.key}
                  type="button"
                  variant="secondary"
                  className="badge-choice"
                  disabled={selected.size >= limit}
                  onClick={() => toggle(b.key)}
                >
                  {b.emoji} {b.label}
                </Button>
              ))
          ) : (
            <p>Условия не найдены. Выберите из групп ниже.</p>
          )}
        </div>
      )}
      <p className="field-hint">До {limit} условий и преимуществ.</p>
      {result.state === 'loading' && <p role="status">Загружаем условия…</p>}
      {result.state === 'error' && (
        <p role="alert">
          Условия не загружены.{' '}
          <Button type="button" variant="secondary" onClick={reload}>
            Повторить
          </Button>
        </p>
      )}
      {result.state === 'ready' &&
        result.data.groups
          .map((group) => ({ ...group, items: group.items.filter((b) => b.key !== 'students_ok') }))
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <BadgeChoices
              key={group.key}
              group={group}
              selected={selected}
              limit={limit}
              toggle={toggle}
            />
          ))}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  )
}
function BadgeChoices({
  group,
  selected,
  limit,
  toggle,
}: {
  group: BadgeGroup
  selected: Set<string>
  limit: number
  toggle: (key: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [count, setCount] = useState(group.items.length)
  const measure = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = measure.current!
    const update = () => {
      const children = [...element.children] as HTMLElement[]
      const rows = [...new Set(children.map((c) => c.offsetTop))]
      setCount(rows.length > 2 ? children.findIndex((c) => c.offsetTop > rows[1]) : children.length)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [group])
  return (
    <div className="badge-picker-group">
      <h4>
        {group.emoji} {group.label}
      </h4>
      <div className="badge-choice-measure" ref={measure} aria-hidden="true">
        {group.items.map((b) => (
          <span className="badge-choice" key={b.key}>
            {b.emoji} {b.label}
            <Check size={14} />
          </span>
        ))}
      </div>
      <div className="badge-choices">
        {(expanded ? group.items : group.items.slice(0, count)).map((b) => (
          <Button
            key={b.key}
            type="button"
            variant="secondary"
            className="badge-choice"
            aria-pressed={selected.has(b.key)}
            disabled={!selected.has(b.key) && selected.size >= limit}
            onClick={() => toggle(b.key)}
          >
            {b.emoji} {b.label}
            {selected.has(b.key) && <Check size={14} />}
          </Button>
        ))}
      </div>
      {count < group.items.length && (
        <Button
          type="button"
          variant="ghost"
          size="small"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Свернуть' : 'Ещё'}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </Button>
      )}
    </div>
  )
}
