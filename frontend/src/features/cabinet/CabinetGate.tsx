import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BriefcaseBusiness, Search } from 'lucide-react'
import { CabinetContext, type Cabinet } from './context'
import { Brand } from '../../shared/ui/Brand'
import { useSession } from '../session/context'
import { bindBackButton } from '../../shared/max/bridge'
import { Button } from '@maxhub/max-ui'
import { MaxLogo } from '../../shared/ui/MaxLogo'

function isWorkerPath(path: string) {
  return /^\/(jobs|my-applications|profile)(\/|$)/.test(path)
}

export function CabinetGate({ children }: { children: ReactNode }) {
  // Deliberately scoped to this authenticated launch. A new launch always asks again.
  const [cabinet, setCabinet] = useState<Cabinet | null>(null)
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { bridge, mode, user } = useSession()
  const choosing = !cabinet || pathname === '/choose'
  useEffect(() => {
    if (choosing) {
      document.title = 'Выбор кабинета · Сезон'
      return bindBackButton(bridge, false, () => {})
    }
  }, [choosing, bridge])
  function choose(value: Cabinet) {
    setCabinet(value)
    const matches = isWorkerPath(pathname) === (value === 'worker') && pathname !== '/choose'
    void navigate(matches ? pathname + search : value === 'worker' ? '/jobs' : '/', {
      replace: true,
    })
  }
  if (choosing)
    return (
      <main className="cabinet-choice">
        <aside className="cabinet-intro">
          <Brand />
          <h2>
            Хороший сезон
            <br />
            начинается с людей.
          </h2>
          <p>Найдите работу или соберите команду — прямо в MAX.</p>
          <MaxLogo />
        </aside>
        <div className="cabinet-choice-content">
          <div className="cabinet-mobile-brand">
            <Brand />
          </div>
          <div className="cabinet-choice-heading">
            <span className="eyebrow">РАБОТА И ЛЮДИ В MAX</span>
            <h1>Как вы хотите зайти?</h1>
            <p>Один аккаунт MAX для работы и найма. К выбору можно вернуться через «Выйти».</p>
          </div>
          <div className="cabinet-options">
            <Button asChild>
              <button className="cabinet-option" onClick={() => choose('employer')}>
                <BriefcaseBusiness size={30} aria-hidden="true" />
                <strong>Зайти как работодатель</strong>
                <span>Создавайте вакансии, рассматривайте отклики и управляйте наймом.</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </Button>
            <Button asChild>
              <button className="cabinet-option" onClick={() => choose('worker')}>
                <Search size={30} aria-hidden="true" />
                <strong>Зайти как работник</strong>
                <span>Находите вакансии, откликайтесь и следите за ответами работодателей.</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </Button>
          </div>
          <div className="cabinet-identity">
            <span className="user-avatar" aria-hidden="true">
              {user.display_name.slice(0, 1)}
            </span>
            <div>
              <strong>{user.display_name}</strong>
              <p>{mode === 'preview' ? 'Демонстрационный аккаунт' : 'Вход через MAX'}</p>
            </div>
          </div>
          {mode === 'preview' && (
            <p className="vacancy-notice">
              Демо: используются примеры, сообщения в MAX не отправляются.
            </p>
          )}
        </div>
      </main>
    )
  if (
    (isWorkerPath(pathname) && cabinet !== 'worker') ||
    (!isWorkerPath(pathname) && cabinet === 'worker')
  )
    return <Navigate to={cabinet === 'worker' ? '/jobs' : '/'} replace />
  return (
    <CabinetContext
      value={{
        cabinet,
        switchCabinet: () => {
          void navigate('/choose', { replace: true })
        },
      }}
    >
      {children}
    </CabinetContext>
  )
}
