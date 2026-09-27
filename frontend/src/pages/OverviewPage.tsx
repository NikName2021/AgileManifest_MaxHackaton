import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowRight, Plus, RefreshCw } from 'lucide-react'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { VacancyFailure, VacancyLoading, VacancyStatusBadge } from '../features/vacancies/VacancyUi'
import { formatSalary, scheduleLabels } from '../features/vacancies/model'
import { MaxLogo } from '../shared/ui/MaxLogo'
import { config } from '../shared/config'

export function OverviewPage() {
  const { vacancies, applications } = useSession()
  const vacancyData = useResource(vacancies.list, 'overview-vacancies')
  const loadCounts = useCallback(
    async (signal: AbortSignal) => {
      const [all, fresh] = await Promise.all([
        applications.list({ limit: 1, offset: 0 }, signal),
        applications.list({ limit: 1, offset: 0, status: 'new' }, signal),
      ])
      return { all: all.total, fresh: fresh.total }
    },
    [applications],
  )
  const counts = useResource(loadCounts, 'overview-applications')
  const rows = vacancyData.result.state === 'ready' ? vacancyData.result.data : []
  const recent = [...rows]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id)
    .slice(0, 3)
  const metrics = [
    {
      label: 'Активные вакансии',
      value:
        vacancyData.result.state === 'ready'
          ? rows.filter((v) => v.status === 'published').length
          : '—',
      href: '/vacancies?status=published',
      hint: 'Опубликованы в MAX',
    },
    {
      label: 'Новые отклики',
      value: counts.result.state === 'ready' ? counts.result.data.fresh : '—',
      href: '/applications?status=new',
      hint: 'Ожидают вашего ответа',
    },
    {
      label: 'Всего откликов',
      value: counts.result.state === 'ready' ? counts.result.data.all : '—',
      href: '/applications',
      hint: 'По всем вашим вакансиям',
    },
    {
      label: 'Черновики',
      value:
        vacancyData.result.state === 'ready'
          ? rows.filter((v) => v.status === 'draft').length
          : '—',
      href: '/vacancies?status=draft',
      hint: 'Можно продолжить работу',
    },
  ]
  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <span className="eyebrow">Кабинет работодателя</span>
          <h1>Обзор найма</h1>
          <p>Вакансии и кандидаты, с которыми вы работаете.</p>
        </div>
        <Button asChild className="primary-button" iconBefore={<Plus size={18} />}>
          <Link to="/vacancies/new">Создать вакансию</Link>
        </Button>
      </div>
      <section className="metric-strip" aria-label="Сводка найма">
        {metrics.map((metric) => (
          <Link className="metric" key={metric.label} to={metric.href}>
            <span>
              {metric.label}
              <ArrowRight size={16} />
            </span>
            <strong>{metric.value}</strong>
            <small>{metric.hint}</small>
          </Link>
        ))}
      </section>
      {counts.result.state === 'error' && (
        <div className="dashboard-warning" role="status">
          Не удалось загрузить количество откликов.
          <button onClick={counts.reload}>Повторить</button>
        </div>
      )}
      <div className="dashboard-layout">
        <section className="dashboard-vacancies" aria-labelledby="recent-title">
          <div className="section-title">
            <h2 id="recent-title">Последние вакансии</h2>
            <Link to="/vacancies">
              Все вакансии <ArrowRight size={15} />
            </Link>
          </div>
          {vacancyData.result.state === 'loading' && <VacancyLoading />}
          {vacancyData.result.state === 'error' && (
            <VacancyFailure error={vacancyData.result.error} retry={vacancyData.reload} />
          )}
          {vacancyData.result.state === 'ready' &&
            (recent.length ? (
              <div className="recent-list">
                {recent.map((v) => (
                  <Link className="recent-vacancy" to={`/vacancies/${v.id}`} key={v.id}>
                    <div>
                      <VacancyStatusBadge status={v.status} />
                      <h3>{v.title}</h3>
                      <p>
                        {v.regionCode || 'Регион не указан'} <span>·</span>{' '}
                        {scheduleLabels[v.schedule]}
                      </p>
                    </div>
                    <div>
                      <strong>{formatSalary(v.salaryMin, v.salaryMax)}</strong>
                      <span className="recent-action">
                        Открыть <ArrowRight size={15} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">
                <span className="empty-index" aria-hidden="true">
                  01
                </span>
                <h3>Добавьте первую вакансию</h3>
                <p>
                  Укажите должность и условия. Сначала сохраните черновик, затем проверьте и
                  опубликуйте его.
                </p>
                <Link className="text-action" to="/vacancies/new">
                  Создать черновик <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          <button
            className="dashboard-refresh"
            onClick={() => {
              vacancyData.reload()
              counts.reload()
            }}
            disabled={vacancyData.result.state === 'loading' || counts.result.state === 'loading'}
          >
            <RefreshCw size={14} />
            Обновить данные
          </button>
        </section>
        <aside className="max-connect">
          <MaxLogo />
          <h2>
            Кандидаты — в MAX.
            <br />
            Управление — здесь.
          </h2>
          <p>
            Бот принимает отклики и отправляет уведомления. В кабинете доступны контакты кандидатов
            и этапы найма.
          </p>
          {config.botUrl && (
            <a
              className="max-bot-link"
              href={config.botUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть бота <ArrowRight size={16} />
            </a>
          )}
          <Link to="/guide" className="max-guide-link">
            Как связаны бот и кабинет
          </Link>
        </aside>
      </div>
      <section className="workflow-strip" aria-label="Порядок работы">
        <div>
          <span>01</span>
          <h3>Создайте вакансию</h3>
          <p>Должность, оплата и условия</p>
        </div>
        <div>
          <span>02</span>
          <h3>Поделитесь в MAX</h3>
          <p>Перешлите карточку в нужные чаты</p>
        </div>
        <div>
          <span>03</span>
          <h3>Обработайте отклики</h3>
          <p>Свяжитесь с кандидатами и обновите этап</p>
        </div>
        <Link to="/guide" aria-label="Подробнее о порядке работы">
          <ArrowRight size={22} />
        </Link>
      </section>
    </>
  )
}
