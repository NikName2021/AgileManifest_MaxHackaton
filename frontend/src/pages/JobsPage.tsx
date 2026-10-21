import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowRight } from 'lucide-react'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { RefreshStatus } from '../shared/ui/RefreshStatus'
import { CandidateError, Loading, Pagination } from '../features/candidate/ui'
import { jobQuery } from '../features/candidate/query'
import { JobSearch } from '../features/candidate/JobSearch'
import { JobCard } from '../features/candidate/JobCard'

export function JobsPage() {
  const { candidate } = useSession()
  const [params, setParams] = useSearchParams()
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
  const search = useCallback((next: URLSearchParams) => setParams(next), [setParams])
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">КАБИНЕТ РАБОТНИКА</span>
          <h1>Найди работу за&nbsp;пару&nbsp;кликов</h1>
        </div>
      </div>
      <JobSearch
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
                      <JobCard key={job.id} job={job} search={key} />
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
