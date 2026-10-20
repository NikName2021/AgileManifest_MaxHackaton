import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowRight, Plus, BriefcaseBusiness, UsersRound, Link2 } from 'lucide-react'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { loadHiringSummary } from '../features/overview/loadSummary'
import { HiringFunnel } from '../features/overview/HiringFunnel'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { RefreshStatus } from '../shared/ui/RefreshStatus'
import { candidateName } from '../features/applications/model'

export function OverviewPage() {
  const { vacancies, applications } = useSession()
  const vacancyData = useResource(vacancies.list, 'overview-vacancies')
  const loadCounts = useCallback(
    (signal: AbortSignal) => loadHiringSummary(applications, signal),
    [applications],
  )
  const loadIncoming = useCallback(
    (signal: AbortSignal) => applications.list({ status: 'new', limit: 3, offset: 0 }, signal),
    [applications],
  )
  const counts = useResource(loadCounts, 'overview-applications')
  const incoming = useResource(loadIncoming, 'overview-incoming')
  const refreshVacancies = vacancyData.refresh,
    refreshCounts = counts.refresh,
    refreshIncoming = incoming.refresh
  const refreshOverview = useCallback(() => {
    refreshVacancies()
    refreshCounts()
    refreshIncoming()
  }, [refreshVacancies, refreshCounts, refreshIncoming])
  const refreshing = vacancyData.isRefreshing || counts.isRefreshing || incoming.isRefreshing
  useRefreshOnReturn(
    refreshOverview,
    vacancyData.result.state === 'loading' || counts.result.state === 'loading' || refreshing,
  )
  const rows = vacancyData.result.state === 'ready' ? vacancyData.result.data : []
  const metrics = [
    {
      label: 'Активные вакансии',
      value:
        vacancyData.result.state === 'ready'
          ? rows.filter((v) => v.status === 'published').length
          : '—',
      href: '/vacancies?status=published',
      icon: BriefcaseBusiness,
    },
    {
      label: 'Новые отклики',
      value: counts.result.state === 'ready' ? (counts.result.data.stages.new ?? '—') : '—',
      href: '/applications?status=new',
      icon: UsersRound,
    },
    {
      label: 'Всего откликов',
      value: counts.result.state === 'ready' ? (counts.result.data.total ?? '—') : '—',
      href: '/applications',
      icon: UsersRound,
    },
    {
      label: 'Черновики',
      value:
        vacancyData.result.state === 'ready'
          ? rows.filter((v) => v.status === 'draft').length
          : '—',
      href: '/vacancies?status=draft',
      icon: BriefcaseBusiness,
    },
  ]
  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <span className="eyebrow">КАБИНЕТ РАБОТОДАТЕЛЯ</span>
          <h1>Ваш сезон — под контролем</h1>
          <p>Новые отклики и текущие задачи вашей команды.</p>
        </div>
        <Button asChild className="primary-button" iconBefore={<Plus size={18} />}>
          <Link to="/vacancies/new">Создать вакансию</Link>
        </Button>
      </div>
      <section className="metric-strip" aria-label="Сводка найма">
        {metrics.map(({ icon: Icon, ...metric }) => (
          <Link className="metric" key={metric.label} to={metric.href}>
            <span>
              {metric.label}
              <Icon size={19} aria-hidden="true" />
            </span>
            <strong>{metric.value}</strong>
            <small>
              Посмотреть <ArrowRight size={17} aria-hidden="true" />
            </small>
          </Link>
        ))}
      </section>
      <RefreshStatus
        refreshing={refreshing}
        failed={Boolean(vacancyData.refreshError || counts.refreshError || incoming.refreshError)}
        retry={refreshOverview}
      />
      {vacancyData.result.state === 'error' && (
        <div className="vacancy-notice" role="alert">
          Не удалось загрузить сводку вакансий.{' '}
          <Button variant="secondary" onClick={vacancyData.reload}>
            Повторить загрузку вакансий
          </Button>
        </div>
      )}
      <div className="overview-grid">
        <div className="overview-primary">
          <section className="attention-panel" aria-labelledby="attention-title">
            <div className="section-title">
              <h2 id="attention-title">Требуют внимания</h2>
              <Link to="/applications?status=new">
                <ArrowRight size={17} /> Все отклики
              </Link>
            </div>
            {incoming.result.state === 'loading' && <p role="status">Загружаем новые отклики…</p>}
            {incoming.result.state === 'error' && (
              <div role="alert">
                <p>Не удалось загрузить новые отклики.</p>
                <Button variant="secondary" onClick={incoming.reload}>
                  Загрузить новые отклики
                </Button>
              </div>
            )}
            {incoming.result.state === 'ready' &&
              (incoming.result.data.items.length ? (
                <div className="attention-list">
                  {incoming.result.data.items.map((item) => (
                    <Link
                      className="attention-row"
                      key={item.id}
                      to={`/applications?vacancy=${item.vacancyId}&status=new`}
                    >
                      <span className="candidate-avatar" aria-hidden="true">
                        {candidateName(item).slice(0, 2).toLocaleUpperCase('ru')}
                      </span>
                      <span>
                        <strong>{candidateName(item)}</strong>
                        <small>{item.vacancy.title}</small>
                      </span>
                      <span className="attention-arrow">
                        <ArrowRight size={20} />
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="attention-empty">
                  <UsersRound size={28} />
                  <h3>Все новые отклики разобраны</h3>
                  <p>Когда кандидат откликнется, он появится здесь.</p>
                  <Link to="/applications">
                    Перейти к откликам <ArrowRight size={16} />
                  </Link>
                </div>
              ))}
          </section>
          <HiringFunnel
            compact
            summary={counts.result.state === 'ready' ? counts.result.data : undefined}
            loading={counts.result.state === 'loading'}
            failed={counts.result.state === 'error'}
            reload={counts.reload}
          />
        </div>
        <aside className="overview-aside">
          <section className="feature-panel">
            <span className="eyebrow">НОВЫЙ СЕЗОН — НОВАЯ КОМАНДА</span>
            <h2>
              Расскажите,
              <br />
              кого вы ищете.
            </h2>
            <p>Добавьте условия и оплату. После публикации вакансию увидят работники.</p>
            <Button asChild className="primary-button" iconBefore={<Plus size={18} />}>
              <Link to="/vacancies/new">Создать вакансию</Link>
            </Button>
          </section>
          <section className="max-vacancy-panel">
            <Link2 size={24} aria-hidden="true" />
            <h2>
              Ваша вакансия
              <br />в MAX
            </h2>
            <p>В карточке есть ссылка для отклика. Ею удобно делиться в чатах.</p>
            <Button asChild variant="secondary" iconBefore={<ArrowRight size={18} />}>
              <Link to="/vacancies">Мои вакансии</Link>
            </Button>
          </section>
        </aside>
      </div>
    </>
  )
}
