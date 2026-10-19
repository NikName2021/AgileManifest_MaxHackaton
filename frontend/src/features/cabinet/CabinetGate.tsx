import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BriefcaseBusiness, Search } from 'lucide-react'
import { CabinetContext, type Cabinet } from './context'
import { Brand } from '../../shared/ui/Brand'
import { useSession } from '../session/context'
import { bindBackButton } from '../../shared/max/bridge'

function isWorkerPath(path: string) {
  return /^\/(jobs|my-applications|profile)(\/|$)/.test(path)
}

export function CabinetGate({ children }: { children: ReactNode }) {
  // Deliberately scoped to this authenticated launch. A new launch always asks again.
  const [cabinet, setCabinet] = useState<Cabinet | null>(null)
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { bridge, mode } = useSession()
  useEffect(() => {
    if (!cabinet) {
      document.title = 'Выбор кабинета · Сезон'
      return bindBackButton(bridge, false, () => {})
    }
  }, [cabinet, bridge])
  function choose(value: Cabinet) {
    setCabinet(value)
    const matches = isWorkerPath(pathname) === (value === 'worker') && pathname !== '/choose'
    void navigate(matches ? pathname + search : value === 'worker' ? '/jobs' : '/', {
      replace: true,
    })
  }
  if (!cabinet)
    return (
      <main className="cabinet-choice">
        <Brand />
        <div className="cabinet-choice-heading">
          <span className="eyebrow">РАБОТА И ЛЮДИ В MAX</span>
          <h1>Как вы хотите зайти?</h1>
          <p>Найдите работу или сотрудников. Кабинет можно сменить в любой момент.</p>
        </div>
        <div className="cabinet-options">
          <button className="cabinet-option" onClick={() => choose('employer')}>
            <BriefcaseBusiness size={30} aria-hidden="true" />
            <strong>Зайти как работодатель</strong>
            <span>Создавайте вакансии, рассматривайте отклики и управляйте наймом.</span>
            <ArrowRight aria-hidden="true" />
          </button>
          <button className="cabinet-option" onClick={() => choose('worker')}>
            <Search size={30} aria-hidden="true" />
            <strong>Зайти как работник</strong>
            <span>Находите вакансии, откликайтесь и следите за ответами работодателей.</span>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <p>Один аккаунт MAX для обоих кабинетов.</p>
        {mode === 'preview' && (
          <p className="vacancy-notice">
            Демо: используются примеры, сообщения в MAX не отправляются.
          </p>
        )}
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
          setCabinet(null)
          void navigate('/choose', { replace: true })
        },
      }}
    >
      {children}
    </CabinetContext>
  )
}
