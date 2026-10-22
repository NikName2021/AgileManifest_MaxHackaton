import { useCallback, useEffect, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { ArrowRight, Copy, Pencil, Plus, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Input } from '../shared/ui/Input'
import { Toast } from '../shared/ui/Toast'
import { useDebounce } from '../shared/hooks/useDebounce'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { RefreshStatus } from '../shared/ui/RefreshStatus'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { formatSalary } from '../features/vacancies/model'
import { VacancyFailure, VacancyLoading, VacancyStatusBadge } from '../features/vacancies/VacancyUi'
import { loadVacancyHiringSummary, type HiringSummary } from '../features/overview/loadSummary'
import { RemainingPlaces } from '../features/capacity/Capacity'
import { useCategories } from '../features/categories/useCategories'
import { categoryLabel } from '../features/categories/api'
import { useRegionName } from '../shared/api/useRegionName'

const filters = [
  { key: 'all', label: 'Все' },
  { key: 'published', label: 'Опубликованы' },
  { key: 'draft', label: 'Черновик' },
  { key: 'closed', label: 'Закрыта' },
]
export function VacanciesPage() {
  const { vacancies, applications } = useSession()
  const resource = useResource(vacancies.list, 'list')
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('q') ?? '')
  const [notice, setNotice] = useState('')
  const query = useDebounce(term, 1000)
  const status = params.get('status') ?? 'all'
  const rows = resource.result.state === 'ready' ? resource.result.data : []
  const ids = rows.map((v) => v.id).join(',')
  const loadStats = useCallback(
    async (signal: AbortSignal) => {
      const entries: [number, HiringSummary | null][] = []
      const queue = ids.split(',').filter(Boolean).map(Number)
      // Bound concurrency for employers with many vacancies; one failed counter does not hide the list.
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (queue.length && !signal.aborted) {
            const id = queue.shift()!
            try {
              entries.push([id, await loadVacancyHiringSummary(applications, id, signal)])
            } catch {
              signal.throwIfAborted()
              entries.push([id, null])
            }
          }
        }),
      )
      return new Map(entries)
    },
    [applications, ids],
  )
  const stats = useResource(loadStats, ids)
  const catalog = useCategories()
  const regionName = useRegionName()
  const { refresh: refreshRows } = resource,
    { refresh: refreshStats } = stats
  const refresh = useCallback(() => {
    refreshRows()
    refreshStats()
  }, [refreshRows, refreshStats])
  useRefreshOnReturn(refresh)
  useEffect(() => {
    window.addEventListener('season:applications-changed', refresh)
    return () => window.removeEventListener('season:applications-changed', refresh)
  }, [refresh])
  useEffect(() => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (query.trim()) next.set('q', query.trim())
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  }, [query, setParams])
  const summary = (id: number) =>
    stats.result.state === 'ready' ? stats.result.data.get(id) : undefined
  const visible = rows
    .filter(
      (v) =>
        (status === 'all' || !filters.some((f) => f.key === status) || v.status === status) &&
        v.title.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')),
    )
    .sort((a, b) => {
      const order = { published: 0, draft: 1, closed: 2 }
      if (a.status !== b.status) return order[a.status] - order[b.status]
      if (a.status === b.status) {
        const newFirst = Number(!!summary(b.id)?.stages.new) - Number(!!summary(a.id)?.stages.new)
        if (newFirst) return newFirst
      }
      return Date.parse(b.createdAt) - Date.parse(a.createdAt)
    })
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Ссылка скопирована')
    } catch {
      setNotice('Не удалось скопировать ссылку')
    }
  }
  return (
    <>
      <div className="page-heading vacancies-heading">
        <div>
          <div className="eyebrow">КАБИНЕТ РАБОТОДАТЕЛЯ</div>
          <h1>Мои вакансии</h1>
        </div>
        {rows.length > 0 && (
          <Button asChild className="primary-button">
            <Link to="/vacancies/new">
              <Plus size={18} />
              Создать
            </Link>
          </Button>
        )}
      </div>
      {(rows.length > 5 || term) && (
        <div className="employer-search">
          <Input
            aria-label="Поиск вакансий"
            type="search"
            iconBefore={<Search size={18} />}
            placeholder="Название вакансии"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
      )}
      {rows.length > 0 && (
        <div className="filter-carousel" role="group" aria-label="Фильтр по статусу">
          {filters.map((f) => {
            const count = rows.filter((v) => f.key === 'all' || v.status === f.key).length
            return (
              count > 0 && (
                <Button
                  key={f.key}
                  variant="secondary"
                  className="filter-chip"
                  aria-pressed={status === f.key}
                  onClick={() =>
                    setParams((p) => {
                      const next = new URLSearchParams(p)
                      if (f.key === 'all') next.delete('status')
                      else next.set('status', f.key)
                      return next
                    })
                  }
                >
                  {f.label} · {count}
                </Button>
              )
            )
          })}
        </div>
      )}
      <RefreshStatus
        refreshing={resource.isRefreshing || stats.isRefreshing}
        failed={!!(resource.refreshError || stats.refreshError)}
        retry={refresh}
      />
      {resource.result.state === 'loading' && <VacancyLoading />}
      {resource.result.state === 'error' && (
        <VacancyFailure error={resource.result.error} retry={resource.reload} />
      )}
      {resource.result.state === 'ready' &&
        (visible.length ? (
          <div className="employer-list">
            {visible.map((v) => {
              const data = summary(v.id),
                fresh = data?.stages.new ?? 0
              const target =
                v.status === 'draft' ? `/vacancies/${v.id}/edit` : `/applications?vacancy=${v.id}`
              return (
                <article
                  key={v.id}
                  className={`employer-vacancy-row linked-row ${fresh > 0 ? 'has-new' : ''} ${v.status === 'closed' ? 'is-closed' : ''}`}
                >
                  <div className="row-description">
                    <h2>
                      <Link className="row-main-link" to={target}>
                        {v.title}
                      </Link>
                    </h2>
                    <p>
                      {formatSalary(v.salaryMin, v.salaryMax)} · {regionName(v.regionCode)} ·{' '}
                      {categoryLabel(
                        v.category,
                        v.categoryDetail,
                        catalog.result.state === 'ready' ? catalog.result.data : [],
                      )}
                    </p>
                  </div>
                  <div className="row-metadata">
                    <VacancyStatusBadge status={v.status} />
                    <span className="row-application-count">
                      {data?.total == null ? 'Отклики: —' : `${data.total} откл.`}
                      {fresh > 0 && (
                        <strong>
                          {' '}
                          · {fresh} новых <span aria-hidden="true">●</span>
                        </strong>
                      )}
                    </span>
                    {v.status === 'published' && v.headcount && data?.stages.hired != null && (
                      <RemainingPlaces spotsLeft={Math.max(0, v.headcount - data.stages.hired)} />
                    )}
                  </div>
                  <div className="row-actions">
                    {v.status === 'published' && v.applyUrl && (
                      <Button
                        variant="secondary"
                        className="icon-button"
                        aria-label={`Скопировать ссылку для MAX: ${v.title}`}
                        onClick={() => void copy(v.applyUrl!)}
                      >
                        <Copy size={18} />
                      </Button>
                    )}
                    <Button
                      asChild
                      variant={v.status === 'draft' ? 'primary' : 'secondary'}
                      className="icon-button"
                    >
                      <Link
                        to={target}
                        aria-label={`${v.status === 'draft' ? 'Продолжить' : v.status === 'closed' ? 'История откликов' : 'Открыть отклики'}: ${v.title}`}
                      >
                        {v.status === 'draft' ? <Pencil size={18} /> : <ArrowRight size={18} />}
                      </Link>
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <section className="empty-panel">
            <h2>{rows.length ? 'Ничего не нашлось' : 'Начнём с вашей первой вакансии'}</h2>
            <p>
              {rows.length
                ? 'Измените запрос или выберите другой статус.'
                : 'Сначала сохраним черновик — опубликуете, когда будете готовы.'}
            </p>
            {rows.length ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setTerm('')
                  setParams({})
                }}
              >
                Сбросить фильтры
              </Button>
            ) : (
              <Button asChild className="primary-button">
                <Link to="/vacancies/new">
                  <Plus size={18} />
                  Создать вакансию
                </Link>
              </Button>
            )}
          </section>
        ))}
      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    </>
  )
}
