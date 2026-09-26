import { Button } from '@maxhub/max-ui'
import { ArrowUpRight, BriefcaseBusiness, MapPin, Plus, RefreshCw, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { formatSalary, scheduleLabels, statusLabels } from '../features/vacancies/model'
import { VacancyFailure, VacancyLoading, VacancyStatusBadge } from '../features/vacancies/VacancyUi'

const filters = ['all', 'draft', 'published', 'closed'] as const
export function VacanciesPage() {
  const { vacancies } = useSession()
  const { result, reload } = useResource(vacancies.list, 'list')
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'all'
  const query = params.get('q') ?? ''
  function filter(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value && value !== 'all') next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }
  const rows = result.state === 'ready' ? result.data : []
  const visible = rows
    .filter(
      (row) =>
        (!filters.includes(status as (typeof filters)[number]) ||
          status === 'all' ||
          row.status === status) &&
        [row.title, row.regionCode, row.category]
          .join(' ')
          .toLocaleLowerCase('ru')
          .includes(query.trim().toLocaleLowerCase('ru')),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id)
  return (
    <>
      <div className="page-heading vacancies-heading">
        <div>
          <div className="eyebrow">ЛЮДИ ДЛЯ ВАШЕГО ДЕЛА</div>
          <h1>Мои вакансии</h1>
          <p>От первого черновика до собранной команды.</p>
        </div>
        <Button asChild className="primary-button">
          <Link to="/vacancies/new">
            <Plus size={18} />
            Создать вакансию
          </Link>
        </Button>
      </div>
      <div className="vacancy-toolbar">
        <label className="vacancy-search">
          <Search size={18} />
          <span className="sr-only">Поиск вакансий</span>
          <input
            type="search"
            placeholder="Должность, город или сфера"
            value={query}
            onChange={(e) => filter('q', e.target.value)}
          />
        </label>
        <Button variant="secondary" onClick={reload} disabled={result.state === 'loading'}>
          <RefreshCw size={16} />
          Обновить
        </Button>
      </div>
      <div className="vacancy-filters" role="group" aria-label="Фильтр по статусу">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={
              status === item ||
              (item === 'all' && !filters.includes(status as (typeof filters)[number]))
            }
            onClick={() => filter('status', item)}
          >
            {item === 'all' ? 'Все' : statusLabels[item]}
            <span>
              {result.state === 'ready'
                ? rows.filter((row) => item === 'all' || row.status === item).length
                : '—'}
            </span>
          </button>
        ))}
      </div>
      {result.state === 'loading' && <VacancyLoading />}
      {result.state === 'error' && <VacancyFailure error={result.error} retry={reload} />}
      {result.state === 'ready' &&
        (visible.length ? (
          <>
            <p className="vacancy-results" role="status">
              Найдено: {visible.length}
            </p>
            <div className="vacancy-list">
              {visible.map((v) => (
                <Link className="vacancy-list-card" key={v.id} to={`/vacancies/${v.id}`}>
                  <div className="vacancy-list-top">
                    <VacancyStatusBadge status={v.status} />
                    <span className="vacancy-date">
                      {new Date(v.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  <h2>{v.title}</h2>
                  <strong className="vacancy-salary">
                    {formatSalary(v.salaryMin, v.salaryMax)}
                  </strong>
                  <div className="vacancy-meta">
                    <span>
                      <MapPin size={15} />
                      {v.regionCode || 'Регион не указан'}
                    </span>
                    <span>{scheduleLabels[v.schedule]}</span>
                  </div>
                  <span className="vacancy-card-link">
                    {v.status === 'draft' ? 'Продолжить работу' : 'Открыть вакансию'}
                    <ArrowUpRight size={17} />
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <section className="vacancy-empty">
            <span className="step-icon">
              <BriefcaseBusiness size={28} />
            </span>
            <h2>{rows.length ? 'Ничего не нашлось' : 'Начнём с вашей первой вакансии'}</h2>
            <p>
              {rows.length
                ? 'Измените запрос или выберите другой статус.'
                : 'Расскажите, кого вы ищете. Сначала сохраним черновик — опубликуете, когда всё будет готово.'}
            </p>
            {rows.length ? (
              <Button variant="secondary" onClick={() => setParams({})}>
                Сбросить фильтры
              </Button>
            ) : (
              <Button asChild className="primary-button">
                <Link to="/vacancies/new">
                  Создать первую вакансию
                  <Plus size={17} />
                </Link>
              </Button>
            )}
          </section>
        ))}
    </>
  )
}
