import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SessionGate } from './SessionGate'
import { useSession } from './context'
import { loadBridge, type MaxBridge } from '../../shared/max/bridge'
import { config } from '../../shared/config'

vi.mock('../../shared/max/bridge', () => ({ loadBridge: vi.fn() }))
vi.mock('../../shared/config', () => ({
  config: {
    allowPreview: true,
    authPath: '/api/auth/max',
    apiBaseUrl: 'https://api.example.test',
    botUrl: null,
  },
}))
// Test the gate independently of MAX UI's rendering implementation.
vi.mock('@maxhub/max-ui', () => ({
  Button: ({ children, onClick, className }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}))
const bridge: MaxBridge = {
  initData: 'signed-fixture',
  platform: 'web',
  BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
}
const credentials = { token: 'session-fixture', user_id: 42 }
function Content() {
  const session = useSession()
  return (
    <div>
      Рабочее пространство: {session.user.display_name}; {session.mode}
      <button onClick={() => void session.vacancies.list().catch(() => {})}>
        Загрузить вакансии
      </button>
    </div>
  )
}
beforeEach(() => {
  config.allowPreview = true
  config.authPath = '/api/auth/max'
  window.WebApp = undefined
  vi.mocked(loadBridge).mockResolvedValue(bridge)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(credentials))))
})
describe('launch and authorization states', () => {
  it('removes private content when a business request rejects the bearer session', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(credentials)))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { code: 'unauthorized' } }), { status: 401 }),
        ),
    )
    render(
      <SessionGate>
        <Content />
      </SessionGate>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Загрузить вакансии' }))
    expect(await screen.findByText('Нужно войти снова')).toBeInTheDocument()
    expect(screen.queryByText(/Рабочее пространство:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Открыть демо' })).not.toBeInTheDocument()
  })
  it('shows loading before the verified workspace', async () => {
    render(
      <SessionGate>
        <Content />
      </SessionGate>,
    )
    expect(screen.getByText('Подключаем рабочее пространство')).toBeInTheDocument()
    expect(await screen.findByText('Рабочее пространство: Мой кабинет; max')).toBeInTheDocument()
  })
  it('requires explicit preview choice outside MAX without calling backend', async () => {
    vi.mocked(loadBridge).mockResolvedValue({ ...bridge, initData: '' })
    render(
      <SessionGate>
        <Content />
      </SessionGate>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть демо' }))
    expect(
      await screen.findByText('Рабочее пространство: Демо-кабинет; preview'),
    ).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not offer preview in production configuration', async () => {
    config.allowPreview = false
    vi.mocked(loadBridge).mockResolvedValue({ ...bridge, initData: '' })
    render(
      <SessionGate>
        <Content />
      </SessionGate>,
    )
    await screen.findByText('Ваша команда начинается здесь')
    expect(screen.queryByRole('button', { name: 'Открыть демо' })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not fall back to preview when the verified login is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    render(
      <SessionGate>
        <Content />
      </SessionGate>,
    )
    await screen.findByText('Нужно войти снова')
    expect(screen.queryByRole('button', { name: 'Открыть демо' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Рабочее пространство:/)).not.toBeInTheDocument()
  })
  it('reports missing auth configuration without making requests', async () => {
    config.authPath = ''
    render(
      <SessionGate>
        <Content />
      </SessionGate>,
    )
    await screen.findByText('Подключение ещё настраивается')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('can retry a failed bridge load', async () => {
    vi.mocked(loadBridge).mockRejectedValueOnce(new Error('failed'))
    render(
      <SessionGate>
        <Content />
      </SessionGate>,
    )
    await screen.findByText('Не удалось подключиться к MAX')
    fireEvent.click(screen.getByRole('button', { name: 'Повторить подключение' }))
    expect(await screen.findByText('Рабочее пространство: Мой кабинет; max')).toBeInTheDocument()
  })
  it('does not install a session after unmount', async () => {
    let finish!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const view = render(
      <SessionGate>
        <Content />
      </SessionGate>,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const options = vi.mocked(fetch).mock.calls[0][1]
    view.unmount()
    expect(options?.signal?.aborted).toBe(true)
    finish(new Response(JSON.stringify(credentials)))
    expect(screen.queryByText(/Рабочее пространство:/)).not.toBeInTheDocument()
  })
})
