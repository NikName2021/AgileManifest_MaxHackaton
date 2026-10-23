import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BriefcaseBusiness, Search, GraduationCap, CircleHelp } from 'lucide-react'
import { CabinetContext, type Cabinet } from './context'
import { Brand } from '../../shared/ui/Brand'
import { useSession } from '../session/context'
import { bindBackButton } from '../../shared/max/bridge'
import { Button } from '@maxhub/max-ui'
import { MaxLogo } from '../../shared/ui/MaxLogo'
import { Modal } from '../../shared/ui/Modal'

function isWorkerPath(path: string) {
  return /^\/(jobs|my-applications|profile|subscriptions)(\/|$)/.test(path)
}
function cabinetForPath(path: string): Cabinet {
  return /^\/channels(\/|$)/.test(path) ? 'partner' : isWorkerPath(path) ? 'worker' : 'employer'
}
function home(value: Cabinet) {
  return value === 'partner' ? '/channels' : value === 'worker' ? '/jobs' : '/vacancies'
}

export function CabinetGate({ children }: { children: ReactNode }) {
  // Deliberately scoped to this authenticated launch. A new launch always asks again.
  const [cabinet, setCabinet] = useState<Cabinet | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { bridge, mode } = useSession()
  const choosing = !cabinet || pathname === '/choose'
  const choice = useRef<HTMLElement>(null)
  useEffect(() => {
    if (choosing) {
      document.title = 'Выбор кабинета · Сезон'
      choice.current?.focus({ preventScroll: true })
      window.scrollTo({ top: 0, behavior: 'instant' })
      return bindBackButton(bridge, false, () => {})
    }
  }, [choosing, bridge])
  function choose(value: Cabinet) {
    setCabinet(value)
    const matches = cabinetForPath(pathname) === value && pathname !== '/choose'
    void navigate(matches ? pathname + search : home(value), {
      replace: true,
    })
  }
  if (choosing)
    return (
      <main className="cabinet-choice" ref={choice} tabIndex={-1}>
        <aside className="cabinet-intro">
          <Brand />
          <h2>
            Хороший сезон
            <br />
            начинается с людей.
          </h2>
          <p>Найдите работу или соберите команду — прямо в MAX.</p>
        </aside>
        <div className="cabinet-choice-content">
          <div className="choice-logo">
            <MaxLogo />
          </div>
          <div className="cabinet-mobile-brand">
            <Brand />
          </div>
          <div className="cabinet-choice-heading">
            <span className="eyebrow">ОДИН АККАУНТ. ВАШИ ВОЗМОЖНОСТИ.</span>
            <h1>С чего начнём?</h1>
            <p>Выберите, что хотите сделать. Вернуться к выбору можно через «Выйти».</p>
          </div>
          <div className="cabinet-options">
            <Button asChild>
              <button className="cabinet-option" onClick={() => choose('worker')}>
                <Search size={30} aria-hidden="true" />
                <strong>Зайти как работник</strong>
                <span>Найти вакансию и откликнуться</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </Button>
            <Button asChild>
              <button className="cabinet-option" onClick={() => choose('employer')}>
                <BriefcaseBusiness size={30} aria-hidden="true" />
                <strong>Зайти как работодатель</strong>
                <span>Разместить вакансию и найти людей</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </Button>
            <Button asChild>
              <button className="cabinet-option" onClick={() => choose('partner')}>
                <GraduationCap size={30} aria-hidden="true" />
                <strong>Зайти как партнёр</strong>
                <span>Каналы вуза и студотряда</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </Button>
          </div>
          {mode === 'preview' && (
            <p className="vacancy-notice">
              Демо: используются примеры, сообщения в MAX не отправляются.
            </p>
          )}
          <Button
            variant="ghost"
            className="cabinet-help"
            iconBefore={<CircleHelp size={18} />}
            onClick={() => setHelpOpen(true)}
          >
            Как работает Сезон
          </Button>
          {helpOpen && (
            <Modal title="Как работает Сезон" onClose={() => setHelpOpen(false)}>
              <div className="cabinet-help-content">
                <section>
                  <h3>Работнику</h3>
                  <p>
                    Выберите вакансию, проверьте условия и оставьте контакт. Статус будет виден в
                    «Моих откликах». Подписки помогут узнавать о новых вакансиях.
                  </p>
                </section>
                <section>
                  <h3>Работодателю</h3>
                  <p>
                    Создайте и опубликуйте вакансию. В «Откликах» связывайтесь с кандидатами и
                    отмечайте этап найма. Приглашайте проверенных сотрудников из «Команды».
                  </p>
                </section>
                <section>
                  <h3>Партнёру</h3>
                  <p>
                    Добавьте бота в канал MAX и разрешите публикацию сообщений. В кабинете включите
                    автопубликацию и сохраните фильтры подходящих вакансий.
                  </p>
                </section>
              </div>
            </Modal>
          )}
        </div>
      </main>
    )
  if (cabinetForPath(pathname) !== cabinet) return <Navigate to={home(cabinet)} replace />
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
