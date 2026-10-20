import { useEffect, useRef } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BriefcaseBusiness,
  CircleHelp,
  House,
  Settings2,
  UsersRound,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react'
import { useSession } from '../features/session/context'
import { bindBackButton } from '../shared/max/bridge'
import { useCabinet } from '../features/cabinet/context'
import { Brand } from '../shared/ui/Brand'
import { MaxLogo } from '../shared/ui/MaxLogo'
import { Button } from '@maxhub/max-ui'
import { useTheme } from '../features/appearance/context'

const employerNavigation = [
  { to: '/', label: 'Обзор', icon: House },
  { to: '/vacancies', label: 'Мои вакансии', icon: BriefcaseBusiness },
  { to: '/applications', label: 'Отклики', icon: UsersRound },
  { to: '/team', label: 'Команда', icon: UsersRound },
  { to: '/settings', label: 'Настройки', icon: Settings2 },
]
const titles: Record<string, string> = {
  '/': 'Кабинет работодателя',
  '/vacancies': 'Вакансии',
  '/applications': 'Отклики',
  '/team': 'Моя команда',
  '/guide': 'Как работает сервис',
  '/settings': 'Настройки',
}
export function Shell() {
  const { mode, bridge } = useSession()
  const { cabinet, switchCabinet } = useCabinet()
  const { preference, setPreference } = useTheme()
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const worker = cabinet === 'worker'
  const home = worker ? '/jobs' : '/'
  const navigation = worker
    ? [
        { to: '/jobs', label: 'Вакансии', icon: BriefcaseBusiness },
        { to: '/my-applications', label: 'Мои отклики', icon: UsersRound },
        { to: '/profile', label: 'Профиль', icon: Settings2 },
      ]
    : employerNavigation
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
  const title = worker
    ? inJob
      ? applying
        ? 'Отклик на вакансию'
        : 'Вакансия'
      : pathname === '/my-applications'
        ? 'Мои отклики'
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
  return (
    <div className={`app-shell ${worker ? 'worker-shell' : ''}`}>
      <a href="#main-content" className="skip-link">
        Перейти к содержимому
      </a>
      <aside className="app-sidebar" aria-label="Панель кабинета">
        <Link to={home} className="brand-link" aria-label="Сезон — на главную">
          <Brand />
        </Link>
        <nav aria-label="Основная навигация" className="sidebar-nav">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className="sidebar-help" to={worker ? '/profile' : '/guide'}>
            <CircleHelp size={18} aria-hidden="true" />
            {worker ? 'Мой профиль' : 'Как работает Сезон'}
          </Link>
          <Button
            variant="secondary"
            iconBefore={<LogOut size={18} aria-hidden="true" />}
            onClick={switchCabinet}
            className="sidebar-exit"
          >
            Выйти
          </Button>
          <MaxLogo />
          <p className="sidebar-note">Работа и люди в MAX</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="site-header">
          <div className="header-inner">
            <Link to={home} className="mobile-brand brand-link" aria-label="Сезон — на главную">
              <Brand />
            </Link>
            <span className="header-product">
              {worker ? 'Найдите работу на свой сезон' : 'Ваше пространство найма'}
            </span>
            <div className="header-account">
              <Button
                variant="ghost"
                className="theme-toggle"
                aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
                onClick={() => setPreference(dark ? 'light' : 'dark')}
              >
                {dark ? (
                  <Sun size={20} aria-hidden="true" />
                ) : (
                  <Moon size={20} aria-hidden="true" />
                )}
              </Button>
              <span className="header-role">{worker ? 'Работник' : 'Работодатель'}</span>
              <Button
                variant="secondary"
                className="mobile-exit"
                aria-label="Выйти"
                title="Выйти"
                onClick={switchCabinet}
              >
                <LogOut size={20} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>
        {mode === 'preview' && (
          <div className="preview-banner">
            <span className="preview-pill">Демо</span>
            <span>Данные хранятся до перезагрузки страницы. Сообщения в MAX не отправляются.</span>
          </div>
        )}
        <main id="main-content" className="main-content" ref={main} tabIndex={-1}>
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
        <footer className="content-footer">
          <span>Сезон · Кабинет {worker ? 'работника' : 'работодателя'}</span>
          <span>Мини-приложение для MAX</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Навигация на телефоне">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
