import { Input } from '../shared/ui/Input'
import { Select } from '../shared/ui/Select'
import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { Search, ArrowRight, BriefcaseBusiness } from 'lucide-react'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { RefreshStatus } from '../shared/ui/RefreshStatus'
import { CandidateError, Loading, Pagination } from '../features/candidate/ui'
import { jobQuery } from '../features/candidate/query'
import { formatSalary, scheduleLabels } from '../features/vacancies/model'
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
      <div className="job-search-main candidate-input">
        <label className="sr-only" htmlFor="job-search">
          Должность или слова из описания
        </label>
        <div>
          <Search size={18} aria-hidden="true" />
          <Input
            id="job-search"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={params.get('q') ?? ''}
            placeholder="Должность или ключевые слова"
          />
          <Button type="submit" className="primary-button" aria-label="Найти вакансии">
            Найти
          </Button>
        </div>
      </div>
      <div className="catalog-filters">
        <Select label="Регион" name="region_code" defaultValue={params.get('region_code') ?? ''}>
          <option value="">Все регионы</option>
          {options('regions', 'region_code')}
        </Select>
        <Select label="Занятость" name="schedule" defaultValue={params.get('schedule') ?? ''}>
          <option value="">Занятость</option>
          {Object.entries(scheduleLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </Select>
        <details className="job-filter-details">
          <summary>Фильтры и сортировка</summary>
          <div className="job-filter-fields">
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
            <div className="candidate-input">
              <label htmlFor="salary_from">Зарплата от, ₽</label>
              <Input
                id="salary_from"
                name="salary_from"
                inputMode="numeric"
                defaultValue={params.get('salary_from') ?? ''}
                placeholder="Не важно"
              />
            </div>
            <div className="candidate-input">
              <label htmlFor="salary_to">Зарплата до, ₽</label>
              <Input
                id="salary_to"
                name="salary_to"
                inputMode="numeric"
                defaultValue={params.get('salary_to') ?? ''}
                placeholder="Не важно"
              />
            </div>
            <label>
              Порядок
              <Select label="Порядок" name="sort" defaultValue={params.get('sort') ?? 'newest'}>
                <option value="newest">Сначала новые</option>
                <option value="salary_desc">По убыванию зарплаты</option>
              </Select>
            </label>
            <Button type="submit" className="primary-button">
              Применить фильтры
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError('')
                onSearch(new URLSearchParams())
              }}
            >
              Сбросить фильтры
            </Button>
          </div>
        </details>
      </div>
      {error && (
        <p role="alert" className="candidate-field-error">
          {error}
        </p>
      )}
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
          <p>Вакансии от работодателей. Без лишних шагов.</p>
        </div>
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
      <div className="catalog-layout">
        <div>
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
                      <article className="job-list-item catalog-job" key={job.id}>
                        <div className="job-employer">
                          <span className="category-icon">
                            <BriefcaseBusiness size={21} />
                          </span>
                          <div>
                            <strong>{job.employer.displayName?.trim() || 'Работодатель'}</strong>
                            <small>{job.regionCode || 'Регион не указан'}</small>
                          </div>
                        </div>
                        <Link to={`/jobs/${job.id}`} state={{ catalogSearch: key }}>
                          <h2>{job.title}</h2>
                        </Link>
                        <strong className="vacancy-salary">
                          {formatSalary(job.salaryMin, job.salaryMax)}
                        </strong>
                        <div className="job-tags">
                          <span>{scheduleLabels[job.schedule]}</span>
                          {job.category && job.category !== 'general' && (
                            <span>{job.category}</span>
                          )}
                        </div>
                        {job.myApplication && (
                          <span className="candidate-applied">Вы уже откликнулись</span>
                        )}
                        <div className="job-card-footer">
                          <small>
                            Опубликована {new Date(job.createdAt).toLocaleDateString('ru-RU')}
                          </small>
                          <Button asChild variant="secondary" iconAfter={<ArrowRight size={17} />}>
                            <Link to={`/jobs/${job.id}`} state={{ catalogSearch: key }}>
                              Подробнее
                            </Link>
                          </Button>
                        </div>
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
        </div>
        <aside className="catalog-aside">
          <section className="feature-panel">
            <span className="eyebrow">ВСЁ НАЧИНАЕТСЯ С ОТКЛИКА</span>
            <h2>Ваша следующая работа — ближе.</h2>
            <p>Откройте вакансию, проверьте условия и оставьте контакт работодателю.</p>
            <Button asChild className="primary-button" iconBefore={<ArrowRight size={18} />}>
              <Link to="/my-applications">Мои отклики</Link>
            </Button>
          </section>
          <section className="contact-tip">
            <h3>Ваш контакт под рукой</h3>
            <p>
              Сохраните контакт один раз. Перед отправкой каждого отклика вы сможете его изменить.
            </p>
            <Link to="/profile">
              <ArrowRight size={18} /> Перейти в профиль
            </Link>
          </section>
        </aside>
      </div>
    </>
  )
}
