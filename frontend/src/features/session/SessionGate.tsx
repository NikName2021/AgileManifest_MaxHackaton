import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@maxhub/max-ui'
import { ArrowRight, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react'
import { config } from '../../shared/config'
import { ApiError } from '../../shared/api/client'
import { loadBridge } from '../../shared/max/bridge'
import { Brand } from '../../shared/ui/Brand'
import { authenticate, authUrl } from './auth'
import { SessionContext, type Session } from './context'

type Issue =
  | 'outside'
  | 'bridge'
  | 'configuration'
  | 'unauthorized'
  | 'forbidden'
  | 'network'
  | 'server'
  | 'contract'
type State =
  { kind: 'loading' } | { kind: 'issue'; issue: Issue } | { kind: 'ready'; session: Session }
const messages: Record<Issue, [string, string]> = {
  outside: [
    'Ваша команда начинается здесь',
    'Откройте «Сезон» из бота в MAX, чтобы перейти в рабочее пространство работодателя.',
  ],
  bridge: [
    'Не удалось подключиться к MAX',
    'Проверьте подключение к интернету и попробуйте ещё раз.',
  ],
  configuration: [
    'Подключение ещё настраивается',
    'Вход в рабочее пространство станет доступен после подключения сервиса. Попробуйте вернуться позже.',
  ],
  unauthorized: [
    'Нужно войти снова',
    'Закройте мини-приложение и откройте его заново из бота в MAX.',
  ],
  forbidden: [
    'Пространство для работодателей',
    'Для этого раздела нужен доступ работодателя. Соискатель может откликнуться на вакансию в боте.',
  ],
  network: ['Сервис не отвечает', 'Проверьте интернет и повторите попытку.'],
  server: [
    'Не удалось выполнить вход',
    'Сервис временно недоступен. Пожалуйста, попробуйте ещё раз немного позже.',
  ],
  contract: [
    'Не удалось подтвердить вход',
    'Не получилось получить данные рабочего пространства. Повторите попытку позже.',
  ],
}

export function SessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const update = (next: State) => {
      if (!controller.signal.aborted) setState(next)
    }
    async function start() {
      let bridge
      try {
        bridge = await loadBridge()
      } catch {
        update({ kind: 'issue', issue: 'bridge' })
        return
      }
      if (!bridge.initData) {
        update({ kind: 'issue', issue: 'outside' })
        return
      }
      if (!config.authPath) {
        update({ kind: 'issue', issue: 'configuration' })
        return
      }
      try {
        const url = authUrl(config.apiBaseUrl, config.authPath, import.meta.env.PROD)
        const user = await authenticate(url, bridge.initData, controller.signal)
        update({ kind: 'ready', session: { user, bridge, mode: 'max' } })
      } catch (error) {
        update({ kind: 'issue', issue: error instanceof ApiError ? error.kind : 'server' })
      }
    }
    void start()
    return () => controller.abort()
  }, [attempt])

  async function openPreview() {
    if (!import.meta.env.DEV) return
    if (!config.allowPreview || window.WebApp?.initData) return
    const { previewSession } = await import('../../mocks/session')
    setState({ kind: 'ready', session: previewSession })
  }
  if (state.kind === 'ready')
    return <SessionContext value={state.session}>{children}</SessionContext>
  const isLoading = state.kind === 'loading'
  const message = isLoading
    ? ['Подключаем рабочее пространство', 'Проверяем запуск в MAX. Это займёт несколько секунд.']
    : messages[state.issue]
  const canPreview =
    config.allowPreview && state.kind === 'issue' && ['outside', 'bridge'].includes(state.issue)
  return (
    <main className="entry-page">
      <div className="entry-brand">
        <Brand />
      </div>
      <section className="entry-card" aria-busy={isLoading}>
        <div className="eyebrow">ЛЮДИ ДЛЯ ВАШЕГО ДЕЛА</div>
        <div className={`entry-symbol ${isLoading ? 'is-loading' : ''}`}>
          {isLoading ? (
            <RefreshCw size={34} />
          ) : state.issue === 'network' ? (
            <WifiOff size={34} />
          ) : (
            <ShieldCheck size={34} />
          )}
        </div>
        <h1>{message[0]}</h1>
        <p role="status">{message[1]}</p>
        {!isLoading && (
          <div className="entry-actions">
            {config.botUrl && (
              <Button asChild className="primary-button">
                <a href={config.botUrl}>
                  Открыть бота в MAX <ArrowRight size={18} />
                </a>
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setState({ kind: 'loading' })
                setAttempt(attempt + 1)
              }}
            >
              Повторить подключение
            </Button>
            {canPreview && (
              <div className="preview-entry">
                <p>Локальный просмотр интерфейса без входа и отправки данных.</p>
                <Button className="primary-button" onClick={() => void openPreview()}>
                  Открыть демо <ArrowRight size={18} />
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
      <p className="entry-footer">Сезонный найм · В одном рабочем пространстве</p>
    </main>
  )
}
