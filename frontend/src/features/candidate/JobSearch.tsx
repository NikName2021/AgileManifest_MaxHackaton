import { useEffect, useState, type FormEvent } from 'react'
import { Button, Switch } from '@maxhub/max-ui'
import { MapPin, Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '../../shared/ui/Input'
import { Select } from '../../shared/ui/Select'
import { Modal } from '../../shared/ui/Modal'
import { useDebounce } from '../../shared/hooks/useDebounce'
import { scheduleLabels } from '../vacancies/model'
import { jobQuery } from './query'
import type { JobFilters } from './api'

export function JobSearch({
  params,
  filters,
  onSearch,
}: {
  params: URLSearchParams
  filters?: JobFilters
  onSearch: (next: URLSearchParams) => void
}) {
  const urlQuery = params.get('q') ?? ''
  const [previousQuery, setPreviousQuery] = useState(urlQuery)
  const [term, setTerm] = useState(urlQuery)
  const [open, setOpen] = useState(false),
    [error, setError] = useState('')
  if (previousQuery !== urlQuery) {
    setPreviousQuery(urlQuery)
    setTerm(urlQuery)
  }
  const debounced = useDebounce(term)
  useEffect(() => {
    if (term !== debounced || debounced.trim() === urlQuery) return
    const next = new URLSearchParams(params)
    if (debounced.trim()) next.set('q', debounced.trim())
    else next.delete('q')
    next.delete('offset')
    onSearch(next)
  }, [debounced, term, urlQuery, params, onSearch])
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('offset')
    onSearch(next)
  }
  function options(key: 'regions' | 'categories', param: string) {
    const rows = filters?.[key] ?? [],
      current = params.get(param)
    return (
      <>
        {current && !rows.some((r) => r.value === current) && (
          <option value={current}>{current}</option>
        )}
        {rows.map((row) => (
          <option key={row.value} value={row.value}>
            {row.label}
          </option>
        ))}
      </>
    )
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams(params)
    for (const key of ['category', 'salary_from', 'salary_to', 'sort']) next.delete(key)
    new FormData(event.currentTarget).forEach((value, key) => {
      if (String(value).trim()) next.set(key, String(value).trim())
    })
    next.delete('offset')
    const checked = jobQuery(next)
    setError(checked.error ?? '')
    if (!checked.error) {
      onSearch(next)
      setOpen(false)
    }
  }
  return (
    <div className="worker-search">
      <Input
        aria-label="Поиск по названию вакансии"
        type="search"
        maxLength={200}
        placeholder="Название вакансии"
        iconBefore={<Search size={20} />}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <div className="worker-filter-row" aria-label="Фильтры вакансий">
        <Button
          type="button"
          variant="secondary"
          className="filter-icon-button"
          aria-label="Фильтры и сортировка"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setError('')
            setOpen(true)
          }}
        >
          <SlidersHorizontal size={19} />
        </Button>
        <Select
          label="Регион"
          className="compact-filter"
          iconBefore={<MapPin size={16} />}
          value={params.get('region_code') ?? ''}
          onChange={(event) => setFilter('region_code', event.target.value)}
        >
          <option value="">Регионы</option>
          {options('regions', 'region_code')}
        </Select>
        <Select
          label="Занятость"
          className="compact-filter"
          value={params.get('schedule') ?? ''}
          onChange={(event) => setFilter('schedule', event.target.value)}
        >
          <option value="">Занятость</option>
          {Object.entries(scheduleLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <label className="student-filter">
          <Switch
            aria-label="Для студентов"
            checked={params.get('student_friendly') === 'true'}
            onChange={(event) => setFilter('student_friendly', event.target.checked ? 'true' : '')}
          />
          <span>Для студентов</span>
        </label>
      </div>
      {open && (
        <Modal title="Фильтры и сортировка" onClose={() => setOpen(false)}>
          <form className="filter-modal-form" onSubmit={apply}>
            <label>
              Сфера деятельности
              <Select
                label="Сфера деятельности"
                name="category"
                defaultValue={params.get('category') ?? ''}
              >
                <option value="">Все сферы</option>
                {options('categories', 'category')}
              </Select>
            </label>
            <div className="filter-salaries">
              <label>
                Зарплата от, ₽
                <Input
                  name="salary_from"
                  aria-label="Зарплата от, ₽"
                  inputMode="numeric"
                  defaultValue={params.get('salary_from') ?? ''}
                  placeholder="Не важно"
                />
              </label>
              <label>
                Зарплата до, ₽
                <Input
                  name="salary_to"
                  aria-label="Зарплата до, ₽"
                  inputMode="numeric"
                  defaultValue={params.get('salary_to') ?? ''}
                  placeholder="Не важно"
                />
              </label>
            </div>
            <label>
              Порядок
              <Select label="Порядок" name="sort" defaultValue={params.get('sort') ?? 'newest'}>
                <option value="newest">Сначала новые</option>
                <option value="salary_desc">По убыванию зарплаты</option>
              </Select>
            </label>
            {error && (
              <p role="alert" className="candidate-field-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onSearch(new URLSearchParams(urlQuery ? { q: urlQuery } : {}))
                  setOpen(false)
                }}
              >
                Сбросить фильтры
              </Button>
              <Button type="submit" className="primary-button">
                Применить
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
