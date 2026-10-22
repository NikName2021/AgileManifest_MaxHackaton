import { useCallback, useId, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { Input } from '../../shared/ui/Input'
import { useDebounce } from '../../shared/hooks/useDebounce'
import { useResource } from '../../shared/api/useResource'
import { useSession } from '../session/context'
import { useCategories } from './useCategories'
import { categoryLabel, suggestCategories } from './api'

export function CategoryInput({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const { mode } = useSession()
  const catalog = useCategories()
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [index, setIndex] = useState(-1)
  const id = useId()
  const query = useDebounce(value.trim(), 250)
  const load = useCallback(
    (signal: AbortSignal) =>
      query ? suggestCategories(query, mode === 'preview', signal) : Promise.resolve(null),
    [query, mode],
  )
  const suggestions = useResource(load, `category-suggestions:${query}`)
  const directory = catalog.result.state === 'ready' ? catalog.result.data : []
  const response =
    query === value.trim() && suggestions.result.state === 'ready' ? suggestions.result.data : null
  const options = searching && value.trim() ? (response?.items ?? []) : directory
  const choose = (name: string) => {
    onChange(name)
    setOpen(false)
    setIndex(-1)
  }
  return (
    <div
      className="vacancy-field category-combobox"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <label htmlFor={id}>Сфера деятельности</label>
      <Input
        id={id}
        name="category"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open && index >= 0 ? `${id}-${index}` : undefined}
        aria-describedby={`${id}-hint`}
        aria-invalid={!!error}
        value={value}
        maxLength={100}
        placeholder="Выберите сферу или напишите своими словами"
        onFocus={() => {
          setSearching(false)
          setOpen(true)
        }}
        onChange={(e) => {
          onChange(e.target.value)
          setSearching(true)
          setOpen(true)
          setIndex(-1)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
            setIndex((i) =>
              Math.max(0, Math.min(options.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
            )
          }
          if (e.key === 'Enter' && open && options[index]) {
            e.preventDefault()
            choose(options[index].name)
          }
        }}
      />
      {open && (
        <div
          id={`${id}-options`}
          className="suggestion-list"
          role="listbox"
          aria-label="Сферы деятельности"
        >
          {options.map((c, i) => (
            <Button
              key={c.name}
              id={`${id}-${i}`}
              type="button"
              variant="ghost"
              role="option"
              aria-selected={i === index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c.name)}
            >
              {c.emoji} {c.name}
            </Button>
          ))}
          {searching && value.trim() && !response && suggestions.result.state !== 'error' && (
            <p role="status">Ищем сферу…</p>
          )}
          {response?.resolved.match === 'other' && !options.length && (
            <p>Можно сохранить свой вариант в сфере «Другое».</p>
          )}
        </div>
      )}
      <small
        id={`${id}-hint`}
        className={error ? 'field-error' : 'field-hint'}
        role={error ? 'alert' : 'status'}
      >
        {error ||
          (response?.resolved.match === 'other'
            ? 'Сфера не найдена — вакансия попадёт в 📌 Другое'
            : response && response.resolved.match !== 'exact'
              ? `Будет сохранено как ${categoryLabel(response.resolved.name, null, directory)}`
              : '')}
      </small>
      {(catalog.result.state === 'error' || suggestions.result.state === 'error') && (
        <p role="alert">
          Подсказки недоступны.{' '}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              catalog.reload()
              suggestions.reload()
            }}
          >
            Повторить
          </Button>
        </p>
      )}
    </div>
  )
}
