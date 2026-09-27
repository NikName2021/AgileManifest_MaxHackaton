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
import { Brand } from '../shared/ui/Brand'

const navigation = [
  { to: '/', label: 'Обзор', icon: House },
  { to: '/vacancies', label: 'Вакансии', icon: BriefcaseBusiness },
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
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const main = useRef<HTMLElement>(null)
  const inVacancy = pathname.startsWith('/vacancies/')
  const backTo = pathname.endsWith('/edit')
    ? pathname.replace(/\/edit$/, '')
    : inVacancy
      ? '/vacancies'
      : '/'
  const title =
    pathname === '/vacancies/new'
      ? 'Новая вакансия'
      : inVacancy
        ? 'Вакансия'
        : (titles[pathname] ?? 'Страница не найдена')
  useEffect(() => {
    document.title = `${title} · Сезон`
    main.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
    return bindBackButton(bridge, pathname !== '/', () => {
      void navigate(backTo)
    })
  }, [bridge, navigate, pathname, title, backTo])
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Перейти к содержимому
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand-link" aria-label="Сезон — на главную">
            <Brand />
          </Link>
          <span className="header-product">
            Подбор персонала<span>для сезонной и временной работы</span>
          </span>
          <div className="header-account">
            <Link className="help-link" to="/guide" aria-label="Как работает Сезон">
              <CircleHelp size={19} />
              <span>Помощь</span>
            </Link>
            <span className="account-divider" />
            <span className="user-avatar" aria-hidden="true">
              {user.display_name.slice(0, 1).toLocaleUpperCase('ru')}
            </span>
            <span className="user-name">
              {user.display_name}
              <small>Работодатель</small>
            </span>
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
            <Link className="nav-guide" to="/guide">
              Как работает сервис
            </Link>
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
        {inVacancy && (
          <Link className="back-link" to={backTo}>
            <ArrowLeft size={16} />
            {backTo === '/vacancies' ? 'К вакансиям' : 'К черновику'}
          </Link>
        )}
        <Outlet />
      </main>
      <footer className="content-footer">
        <span>Сезон · Кабинет работодателя</span>
        <Link to="/guide">Работа с сервисом</Link>
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
