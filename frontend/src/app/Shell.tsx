import { useCallback, useEffect, useRef } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BriefcaseBusiness,
  Handshake,
  Settings2,
  UsersRound,
  LogOut,
  Moon,
  Sun,
  Bell,
  GraduationCap,
} from 'lucide-react'
import { useSession } from '../features/session/context'
import { bindBackButton } from '../shared/max/bridge'
import { useCabinet } from '../features/cabinet/context'
import { Brand } from '../shared/ui/Brand'
import { ProfileIdentity } from '../shared/ui/ProfileIdentity'
import { Button } from '@maxhub/max-ui'
import { useResource } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { useTheme } from '../features/appearance/context'
import { PullToRefresh } from '../shared/ui/PullToRefresh'

const employerNavigation = [
  { to: '/vacancies', label: 'Мои вакансии', icon: BriefcaseBusiness },
  { to: '/applications', label: 'Отклики', icon: UsersRound },
  { to: '/team', label: 'Команда', icon: Handshake },
  { to: '/settings', label: 'Профиль', icon: Settings2 },
]
const titles: Record<string, string> = {
  '/': 'Кабинет работодателя',
  '/vacancies': 'Вакансии',
  '/applications': 'Отклики',
  '/team': 'Команда',
  '/guide': 'Как работает сервис',
  '/settings': 'Профиль',
}
export function Shell() {
  const { bridge, applications } = useSession()
  const { cabinet, switchCabinet } = useCabinet()
  const { preference, setPreference } = useTheme()
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const worker = cabinet === 'worker'
  const partner = cabinet === 'partner'
  const home = partner ? '/channels' : worker ? '/jobs' : '/vacancies'
  const navigation = partner
    ? [{ to: '/channels', label: 'Каналы', icon: GraduationCap }]
    : worker
      ? [
          { to: '/jobs', label: 'Вакансии', icon: BriefcaseBusiness },
          { to: '/my-applications', label: 'Мои отклики', icon: UsersRound },
          { to: '/subscriptions', label: 'Подписки', icon: Bell },
          { to: '/profile', label: 'Профиль', icon: Settings2 },
        ]
      : employerNavigation
  const loadCount = useCallback(
    (signal: AbortSignal) =>
      cabinet === 'employer'
        ? applications.list({ status: 'new', limit: 1, offset: 0 }, signal).then((r) => r.total)
        : Promise.resolve(0),
    [applications, cabinet],
  )
  const count = useResource(loadCount, `navigation:new-applications:${cabinet}`)
  useRefreshOnReturn(count.refresh)
  useEffect(() => {
    window.addEventListener('season:applications-changed', count.refresh)
    return () => window.removeEventListener('season:applications-changed', count.refresh)
  }, [count.refresh])
  const unread = count.result.state === 'ready' ? count.result.data : 0
  const badge = (to: string) =>
    to === '/applications' && unread > 0 ? (
      <span className="nav-count" aria-label={`${unread} новых откликов`}>
        {unread}
      </span>
    ) : null
  const { pathname, search, state } = useLocation()
  const inJob = /^\/jobs\/[^/]+$/.test(pathname)
  const applying = inJob && new URLSearchParams(search).get('step') === 'apply'
  const catalogSearch = typeof state?.catalogSearch === 'string' ? state.catalogSearch : ''
  const navigate = useNavigate()
  const main = useRef<HTMLElement>(null)
  const inVacancy = pathname.startsWith('/vacancies/')
  const isCopy = /^\/vacancies\/\d+\/copy$/.test(pathname)
  const backTo = inJob
    ? applying
      ? pathname
      : `/jobs${catalogSearch ? '?' + catalogSearch : ''}`
    : pathname.endsWith('/edit') || isCopy
      ? pathname.replace(/\/(edit|copy)$/, '')
      : inVacancy
        ? '/vacancies'
        : home
  const title = partner
    ? 'Каналы партнёра'
    : worker
      ? inJob
        ? applying
          ? 'Отклик на вакансию'
          : 'Вакансия'
        : pathname === '/my-applications'
          ? 'Мои отклики'
          : pathname === '/subscriptions'
            ? 'Подписки на вакансии'
            : pathname === '/profile'
              ? 'Профиль работника'
              : 'Поиск работы'
      : isCopy
        ? 'Копия вакансии'
        : pathname === '/vacancies/new'
          ? 'Новая вакансия'
          : inVacancy
            ? 'Вакансия'
            : (titles[pathname] ?? 'Страница не найдена')
  useEffect(() => {
    document.title = `${title} · Сезон`
    main.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
    return bindBackButton(bridge, pathname !== home, () => {
      void navigate(backTo, { state: { catalogSearch } })
    })
  }, [bridge, navigate, pathname, title, backTo, home, catalogSearch])
  const themeButton = (
    <Button
      variant="secondary"
      className="icon-button theme-toggle"
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      onClick={() => setPreference(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </Button>
  )
  const accountActions = (
    <div className="sidebar-account-actions">
      <Button
        variant="secondary"
        iconBefore={<LogOut size={18} />}
        onClick={switchCabinet}
        className="sidebar-exit"
      >
        Выйти
      </Button>
      {themeButton}
    </div>
  )
  const account = (
    <div className="sidebar-bottom">
      {partner ? (
        <div className="sidebar-account">
          <ProfileIdentity subtitle="Партнёр" />
        </div>
      ) : (
        <Link
          className={`sidebar-account${pathname === (worker ? '/profile' : '/settings') ? ' active' : ''}`}
          to={worker ? '/profile' : '/settings'}
          aria-label="Открыть профиль"
        >
          <ProfileIdentity subtitle={worker ? 'Работник' : 'Работодатель'} />
        </Link>
      )}
      {accountActions}
    </div>
  )
  return (
    <div className={`app-shell ${partner ? 'partner-shell' : worker ? 'worker-shell' : ''}`}>
      <a href="#main-content" className="skip-link">
        Перейти к содержимому
      </a>
      <aside className="app-sidebar" aria-label="Панель кабинета">
        <Link to={home} className="brand-link" aria-label="Сезон — на главную">
          <Brand />
        </Link>
        <nav aria-label="Основная навигация" className="sidebar-nav">
          {navigation
            .filter(({ to }) => !['/profile', '/settings'].includes(to))
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
                {badge(to)}
              </NavLink>
            ))}
        </nav>
        {account}
      </aside>
      <div className="workspace">
        <main
          id="main-content"
          className={`main-content${['/profile', '/settings', '/subscriptions'].includes(pathname) ? ' narrow-page' : ''}`}
          ref={main}
          tabIndex={-1}
        >
          <div className="page-tools">
            <PullToRefresh key={pathname + search} target={main} />
            <div className="mobile-account-actions">
              {themeButton}
              <Button
                variant="secondary"
                className="icon-button mobile-logout"
                aria-label="Выйти"
                title="Выйти"
                onClick={switchCabinet}
              >
                <LogOut size={20} aria-hidden="true" />
              </Button>
            </div>
          </div>
          {(inVacancy || (inJob && !applying)) && (
            <Link className="back-link" to={backTo}>
              <ArrowLeft size={16} />
              {inJob
                ? 'К поиску работы'
                : backTo === '/vacancies'
                  ? 'К вакансиям'
                  : isCopy
                    ? 'К исходной вакансии'
                    : 'К черновику'}
            </Link>
          )}
          <Outlet />
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Нижняя навигация">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
            {badge(to)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
