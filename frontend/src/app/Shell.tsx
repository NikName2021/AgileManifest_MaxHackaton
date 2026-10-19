import { useEffect, useRef } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BriefcaseBusiness,
  CircleHelp,
  House,
  Settings2,
  UsersRound,
} from 'lucide-react'
import { useSession } from '../features/session/context'
import { bindBackButton } from '../shared/max/bridge'
import { useCabinet } from '../features/cabinet/context'
import { Brand } from '../shared/ui/Brand'

const employerNavigation = [
  { to: '/', label: 'Обзор', icon: House },
  { to: '/vacancies', label: 'Мои вакансии', icon: BriefcaseBusiness },
  { to: '/applications', label: 'Отклики', icon: UsersRound },
  { to: '/settings', label: 'Настройки', icon: Settings2 },
]
const titles: Record<string, string> = {
  '/': 'Кабинет работодателя',
  '/vacancies': 'Вакансии',
  '/applications': 'Отклики',
  '/guide': 'Как работает сервис',
  '/settings': 'Настройки',
}
export function Shell() {
  const { user, mode, bridge } = useSession()
  const { cabinet, switchCabinet } = useCabinet()
  const worker = cabinet === 'worker'
  const home = worker ? '/jobs' : '/'
  const navigation = worker
    ? [
        { to: '/jobs', label: 'Вакансии', icon: BriefcaseBusiness },
        { to: '/my-applications', label: 'Мои отклики', icon: UsersRound },
        { to: '/profile', label: 'Профиль', icon: Settings2 },
      ]
    : employerNavigation
  const { pathname, state } = useLocation()
  const inJob = /^\/jobs\/[^/]+$/.test(pathname)
  const catalogSearch = typeof state?.catalogSearch === 'string' ? state.catalogSearch : ''
  const navigate = useNavigate()
  const main = useRef<HTMLElement>(null)
  const inVacancy = pathname.startsWith('/vacancies/')
  const isCopy = /^\/vacancies\/\d+\/copy$/.test(pathname)
  const backTo = inJob
    ? `/jobs${catalogSearch ? '?' + catalogSearch : ''}`
    : pathname.endsWith('/edit') || isCopy
      ? pathname.replace(/\/(edit|copy)$/, '')
      : inVacancy
        ? '/vacancies'
        : home
  const title = worker
    ? inJob
      ? 'Вакансия'
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
      void navigate(backTo)
    })
  }, [bridge, navigate, pathname, title, backTo, home])
  return (
    <div className={`app-shell ${worker ? 'worker-shell' : ''}`}>
      <a href="#main-content" className="skip-link">
        Перейти к содержимому
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link to={home} className="brand-link" aria-label="Сезон — на главную">
            <Brand />
          </Link>
          <span className="header-product">
            {cabinet === 'worker' ? 'Поиск работы' : 'Подбор персонала'}
            <span>для сезонной и временной работы</span>
          </span>
          <div className="header-account">
            <Link
              className="help-link"
              to={worker ? '/profile' : '/guide'}
              aria-label={worker ? 'Профиль работника' : 'Как работает Сезон'}
            >
              <CircleHelp size={19} />
              <span>{worker ? 'Профиль' : 'Помощь'}</span>
            </Link>
            <span className="account-divider" />
            <span className="user-avatar" aria-hidden="true">
              {user.display_name.slice(0, 1).toLocaleUpperCase('ru')}
            </span>
            <span className="user-name">
              {user.display_name}
              <small>{worker ? 'Работник' : 'Работодатель'}</small>
            </span>
            <button className="cabinet-switch" onClick={switchCabinet}>
              Сменить режим
            </button>
          </div>
        </div>
        <div className="desktop-nav-wrap">
          <nav aria-label="Основная навигация" className="desktop-nav">
            {navigation.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {label}
              </NavLink>
            ))}
            <button className="nav-guide cabinet-switch" onClick={switchCabinet}>
              Сменить режим
            </button>
          </nav>
        </div>
      </header>
      {mode === 'preview' && (
        <div className="preview-banner">
          <span className="preview-pill">Демо</span>
          <span>Данные хранятся до перезагрузки страницы. Сообщения в MAX не отправляются.</span>
        </div>
      )}
      <main id="main-content" className="main-content" ref={main} tabIndex={-1}>
        {(inVacancy || inJob) && (
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
        <button className="cabinet-switch" onClick={switchCabinet}>
          Сменить режим
        </button>
        <span>Мини-приложение для MAX</span>
      </footer>
      <nav className="mobile-nav" aria-label="Навигация на телефоне">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
