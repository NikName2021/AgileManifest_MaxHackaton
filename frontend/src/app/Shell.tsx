import { useEffect, useRef } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
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
  '/': 'Рабочее пространство',
  '/vacancies': 'Вакансии',
  '/applications': 'Отклики',
  '/guide': 'Как работает Сезон',
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
      <aside className="sidebar">
        <Link to="/" className="brand-link" aria-label="Сезон — на главную">
          <Brand />
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">С</span>
          <span>
            Мой бизнес<small>Кабинет работодателя</small>
          </span>
        </div>
        <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Основная навигация">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} strokeWidth={1.7} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/guide" className="sidebar-guide">
            <BookOpen size={21} />
            <strong>Первый раз в Сезоне?</strong>
            <span>Коротко о том, как всё устроено</span>
            <ArrowUpRight size={18} className="guide-arrow" />
          </Link>
          <div className="sidebar-footer">
            <span className="status-dot" />
            Мини-приложение MAX
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="desktop-breadcrumb">
            Сезон <span>/</span> <strong>{title}</strong>
          </div>
          <Link to="/" className="mobile-brand" aria-label="Сезон — на главную">
            <Brand />
          </Link>
          <div className="topbar-actions">
            <Link className="help-link" to="/guide" aria-label="Как работает Сезон">
              <CircleHelp size={21} />
            </Link>
            <span className="topbar-divider" />
            <div className="user-avatar" aria-hidden="true">
              {user.display_name.slice(0, 1).toLocaleUpperCase('ru')}
            </div>
            <span className="user-name">
              {user.display_name}
              <small>Работодатель</small>
            </span>
          </div>
        </header>
        {mode === 'preview' && (
          <div className="preview-banner">
            <span className="preview-pill">ДЕМО</span>
            <span>
              Данные только в памяти браузера, до перезагрузки. Сообщения в MAX не отправляются.
            </span>
          </div>
        )}
        <main id="main-content" className="main-content" ref={main} tabIndex={-1}>
          {pathname !== '/' && (
            <Link className="back-link" to={backTo}>
              <ArrowLeft size={16} />
              {backTo === '/'
                ? 'На главную'
                : backTo === '/vacancies'
                  ? 'К вакансиям'
                  : 'К черновику'}
            </Link>
          )}
          <Outlet />
        </main>
        <footer className="content-footer">
          <span>Сезон · Помогаем собрать команду</span>
          <Link to="/guide">
            Как это работает <ArrowUpRight size={14} />
          </Link>
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
            <Icon size={21} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
