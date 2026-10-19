import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { Search } from 'lucide-react'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { RefreshStatus } from '../shared/ui/RefreshStatus'
import { CandidateError, JobFacts, Loading, Pagination } from '../features/candidate/ui'
import { jobQuery } from '../features/candidate/query'
import { scheduleLabels } from '../features/vacancies/model'
import type { JobFilters } from '../features/candidate/api'

function SearchForm({
  params,
  filters,
  onSearch,
}: {
  params: URLSearchParams
  filters?: JobFilters
  onSearch: (p: URLSearchParams) => void
}) {
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams()
    new FormData(event.currentTarget).forEach((value, key) => {
      if (String(value).trim()) next.set(key, String(value).trim())
    })
    const checked = jobQuery(next)
    setError(checked.error ?? '')
    if (!checked.error) onSearch(next)
  }
  function options(key: 'regions' | 'categories', param: string) {
    const rows = filters?.[key] ?? [],
      current = params.get(param)
    return (
      <>
        {current && !rows.some((r) => r.value === current) && (
          <option value={current}>{current}</option>
        )}
        {rows.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </>
    )
  }
  return (
    <form className="job-search-form" onSubmit={submit}>
      <label className="job-search-main">
        <span>Должность или слова из описания</span>
        <div>
          <Search size={18} aria-hidden="true" />
          <input
            name="q"
            type="search"
            maxLength={200}
            defaultValue={params.get('q') ?? ''}
            placeholder="Например, повар или сборщик урожая"
          />
        </div>
      </label>
      <div className="job-filter-fields">
        <label>
          Регион
          <select name="region_code" defaultValue={params.get('region_code') ?? ''}>
            <option value="">Все регионы</option>
            {options('regions', 'region_code')}
          </select>
        </label>
        <label>
          Сфера деятельности
          <select name="category" defaultValue={params.get('category') ?? ''}>
            <option value="">Все сферы</option>
            {options('categories', 'category')}
          </select>
        </label>
        <label>
          Занятость
          <select name="schedule" defaultValue={params.get('schedule') ?? ''}>
            <option value="">Любая</option>
            {Object.entries(scheduleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Зарплата от, ₽
          <input
            name="salary_from"
            inputMode="numeric"
            defaultValue={params.get('salary_from') ?? ''}
            placeholder="Не важно"
          />
        </label>
        <label>
          Зарплата до, ₽
          <input
            name="salary_to"
            inputMode="numeric"
            defaultValue={params.get('salary_to') ?? ''}
            placeholder="Не важно"
          />
        </label>
        <label>
          Порядок
          <select name="sort" defaultValue={params.get('sort') ?? 'newest'}>
            <option value="newest">Сначала новые</option>
            <option value="salary_desc">По убыванию зарплаты</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="candidate-field-error">
          {error}
        </p>
      )}
      <div className="vacancy-actions">
        <Button type="submit" className="primary-button">
          Найти вакансии
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setError('')
            onSearch(new URLSearchParams())
          }}
        >
          Сбросить фильтры
        </Button>
      </div>
    </form>
  )
}

export function JobsPage() {
  const { candidate } = useSession()
  const [params, setParams] = useSearchParams()
  const [formRevision, setFormRevision] = useState(0)
  const key = params.toString()
  const { query, error } = useMemo(() => jobQuery(new URLSearchParams(key)), [key])
  const load = useCallback(
    (signal: AbortSignal) =>
      error
        ? Promise.resolve({ items: [], total: 0, limit: query.limit, offset: query.offset })
        : candidate.jobs(query, signal),
    [candidate, query, error],
  )
  const resource = useResource(load, key),
    filters = useResource(candidate.filters, 'job-filters')
  useRefreshOnReturn(resource.refresh)
  const { result } = resource
  function search(next: URLSearchParams) {
    setParams(next)
    setFormRevision((n) => n + 1)
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">КАБИНЕТ РАБОТНИКА</span>
          <h1>Найдите свою работу</h1>
          <p>Сезонные, временные и постоянные вакансии от работодателей.</p>
        </div>
        <Button variant="secondary" disabled={resource.isRefreshing} onClick={resource.refresh}>
          Обновить
        </Button>
      </div>
      <SearchForm
        key={`${key}:${formRevision}`}
        params={params}
        filters={filters.result.state === 'ready' ? filters.result.data : undefined}
        onSearch={search}
      />
      {filters.result.state === 'error' && (
        <div className="vacancy-notice">
          <p>Не удалось загрузить список регионов и сфер. Поиск по словам доступен.</p>
          <Button variant="secondary" onClick={filters.reload}>
            Загрузить фильтры
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="vacancy-notice is-error">
          {error}
        </p>
      ) : (
        <>
          <RefreshStatus
            refreshing={resource.isRefreshing}
            failed={!!resource.refreshError}
            retry={resource.refresh}
          />
          {result.state === 'loading' && <Loading />}
          {result.state === 'error' && (
            <CandidateError error={result.error} retry={resource.reload} />
          )}
          {result.state === 'ready' && (
            <>
              <p className="candidate-result-count" role="status">
                Найдено вакансий: {result.data.total}
              </p>
              <div className="job-list">
                {result.data.items.map((job) => (
                  <article className="job-list-item" key={job.id}>
                    <Link to={`/jobs/${job.id}`} state={{ catalogSearch: key }}>
                      <h2>{job.title}</h2>
                    </Link>
                    <JobFacts job={job} />
                    {job.myApplication && (
                      <span className="candidate-applied">Вы уже откликнулись</span>
                    )}
                    <Link
                      className="text-link"
                      to={`/jobs/${job.id}`}
                      state={{ catalogSearch: key }}
                    >
                      Подробнее о вакансии →
                    </Link>
                  </article>
                ))}
              </div>
              {!result.data.items.length && (
                <section className="empty-panel">
                  <h2>
                    {query.offset
                      ? 'На этой странице нет вакансий'
                      : 'Пока нет подходящих вакансий'}
                  </h2>
                  <p>Измените условия поиска или вернитесь позже.</p>
                  <Button variant="secondary" onClick={() => search(new URLSearchParams())}>
                    Показать все вакансии
                  </Button>
                </section>
              )}
              <Pagination
                {...result.data}
                onPage={(offset) => {
                  const next = new URLSearchParams(params)
                  next.set('offset', String(offset))
                  setParams(next)
                }}
              />
            </>
          )}
        </>
      )}
    </>
  )
}
