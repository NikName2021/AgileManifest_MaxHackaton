import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ApplicationsPage } from '../../pages/ApplicationsPage'
import { createPreviewSession } from '../../mocks/session'
import { SessionContext, type Session } from '../session/context'
import { ApiError } from '../../shared/api/client'
import type { StatusResult } from './api'

vi.mock('@maxhub/max-ui', () => ({
  Button: ({
    children,
    asChild,
    variant,
    size,
    iconBefore,
    iconAfter,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean
    variant?: string
    size?: string
    iconBefore?: ReactNode
    iconAfter?: ReactNode
  }) => {
    void variant
    void size
    void iconBefore
    void iconAfter
    return asChild ? children : <button {...props}>{children}</button>
  },
}))
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute('open', '')
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute('open')
      },
    },
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
function start(session: Session, path = '/applications') {
  const router = createMemoryRouter(
    [
      { path: '/applications', element: <ApplicationsPage /> },
      { path: '/vacancies/:id', element: <h1>Карточка вакансии</h1> },
    ],
    { initialEntries: [path] },
  )
  render(
    <SessionContext value={session}>
      <RouterProvider router={router} />
    </SessionContext>,
  )
  return router
}
async function seeded() {
  const session = createPreviewSession()
  await session.loadApplicationExamples!()
  return session
}
async function openFirst() {
  fireEvent.click((await screen.findAllByRole('button', { name: /Открыть отклик:/ }))[0])
  return within(screen.getByRole('dialog'))
}
function chooseStatus(value: string) {
  fireEvent.change(screen.getByLabelText('Новый этап'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Изменить статус' }))
}

afterEach(() => vi.useRealTimers())
describe('employer applications workflow', () => {
  it('defers return refresh while a candidate dialog is open and retains the current filter', async () => {
    const session = await seeded()
    const list = vi.spyOn(session.applications, 'list')
    const router = start(session, '/applications?status=new')
    const dialog = await openFirst()
    fireEvent.change(dialog.getByLabelText('Новый этап'), { target: { value: 'invited' } })
    const before = list.mock.calls.length
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.useFakeTimers()
    fireEvent.focus(window)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(list).toHaveBeenCalledTimes(before)
    expect(dialog.getByLabelText('Новый этап')).toHaveValue('invited')
    fireEvent.click(dialog.getByRole('button', { name: 'Закрыть карточку кандидата' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(list).toHaveBeenCalledTimes(before + 1)
    expect(list).toHaveBeenLastCalledWith(
      { limit: 20, offset: 0, status: 'new' },
      expect.any(AbortSignal),
    )
    expect(router.state.location.search).toBe('?status=new')
  })
  it('loads demo only by explicit choice, paginates and resets the page on filtering without network', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const session = createPreviewSession()
    const list = vi.spyOn(session.applications, 'list')
    const router = start(session)
    await screen.findByRole('heading', { name: 'Пока нет откликов' })
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить демо-отклики' }))
    await screen.findByText('Найдено: 46 · Показаны 1–20')
    expect(screen.getAllByRole('article')).toHaveLength(20)
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByText('Найдено: 46 · Показаны 21–40')
    expect(router.state.location.search).toBe('?page=2')
    expect(list).toHaveBeenLastCalledWith(
      { limit: 20, offset: 20, status: undefined },
      expect.any(AbortSignal),
    )
    fireEvent.click(screen.getByRole('button', { name: /Новый/ }))
    await screen.findByText('Найдено: 10 · Показаны 1–10')
    expect(router.state.location.search).toBe('?status=new')
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить демо-отклики' }))
    await screen.findByText('Найдено: 46 · Показаны 1–20')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('reads vacancy-scoped arrays once and filters/paginates them locally, including closed vacancies', async () => {
    const session = await seeded()
    const vacancy = (await session.vacancies.list())[0]
    await session.vacancies.close(vacancy.id)
    const read = vi.spyOn(session.applications, 'forVacancy')
    const list = vi.spyOn(session.applications, 'list')
    start(session, `/applications?vacancy=${vacancy.id}`)
    await screen.findByText('Найдено: 23 · Показаны 1–20')
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByText('Найдено: 23 · Показаны 21–23')
    fireEvent.click(screen.getByRole('button', { name: /Новый/ }))
    await screen.findByText('Найдено: 5 · Показаны 1–5')
    expect(read).toHaveBeenCalledOnce()
    expect(list).not.toHaveBeenCalled()
    const dialog = await openFirst()
    expect(dialog.getByText(/Вакансия закрыта/)).toBeInTheDocument()
    expect(dialog.getByLabelText('Новый этап')).toBeEnabled()
  })
  it('requires confirmation, prevents double writes and separates saved status from failed notification', async () => {
    const session = await seeded()
    session.mode = 'max'
    const realUpdate = session.applications.updateStatus
    let resolve!: (result: StatusResult) => void
    const update = vi.spyOn(session.applications, 'updateStatus').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const router = start(session, '/applications?status=new')
    const dialog = await openFirst()
    expect(dialog.getByText('Кандидат не оставил контакт для связи.')).toBeInTheDocument()
    chooseStatus('invited')
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Отмена' }))
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Изменить статус' }))
    const confirm = dialog.getByRole('button', { name: 'Подтвердить изменение' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(update).toHaveBeenCalledExactlyOnceWith(1, 'invited')
    expect(dialog.getByRole('button', { name: 'Закрыть карточку кандидата' })).toBeDisabled()
    await act(() => router.navigate('/vacancies/1'))
    expect(router.state.location.pathname).toBe('/applications')
    await act(async () => resolve(await realUpdate(1, 'invited')))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Статус «Приглашён» сохранён. Уведомление не отправлено.',
    )
    expect(dialog.getByRole('button', { name: 'Изменить статус' })).toBeDisabled()
    fireEvent.click(dialog.getByRole('button', { name: 'Закрыть карточку кандидата' }))
    await screen.findByText('Найдено: 9 · Показаны 1–9')
    expect(screen.queryByRole('heading', { name: 'Анна · демо 1' })).not.toBeInTheDocument()
    expect(update).toHaveBeenCalledOnce()
  })
  it('reconciles a lost write response without repeating a notification', async () => {
    const session = await seeded()
    session.mode = 'max'
    const realUpdate = session.applications.updateStatus
    const update = vi
      .spyOn(session.applications, 'updateStatus')
      .mockImplementation(async (id, status) => {
        await realUpdate(id, status)
        throw new ApiError('network')
      })
    const read = vi.spyOn(session.applications, 'forVacancy')
    start(session)
    const dialog = await openFirst()
    chooseStatus('hired')
    fireEvent.click(dialog.getByRole('button', { name: 'Подтвердить изменение' }))
    await dialog.findByText(/Актуальный статус: «Нанят»/)
    expect(dialog.getByLabelText('Новый этап')).toHaveValue('hired')
    expect(dialog.getByRole('button', { name: 'Изменить статус' })).toBeDisabled()
    expect(update).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledOnce()
  })
  it('blocks another write until a failed reconciliation can be read successfully', async () => {
    const session = await seeded()
    const update = vi
      .spyOn(session.applications, 'updateStatus')
      .mockRejectedValue(new ApiError('network'))
    vi.spyOn(session.applications, 'forVacancy').mockRejectedValueOnce(new ApiError('network'))
    start(session)
    const dialog = await openFirst()
    chooseStatus('contacted')
    fireEvent.click(dialog.getByRole('button', { name: 'Подтвердить изменение' }))
    const refresh = await dialog.findByRole('button', { name: 'Проверить текущий статус' })
    await waitFor(() => expect(refresh).toBeEnabled())
    expect(dialog.getByLabelText('Новый этап')).toBeDisabled()
    fireEvent.click(refresh)
    await dialog.findByText(/Актуальный статус: «Новый»/)
    expect(dialog.getByLabelText('Новый этап')).toBeEnabled()
    expect(update).toHaveBeenCalledOnce()
  })
  it('shows load and ownership errors with a working retry', async () => {
    const session = await seeded()
    vi.spyOn(session.applications, 'list').mockRejectedValueOnce(new ApiError('forbidden', 403))
    start(session)
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа к этим откликам')
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку откликов' }))
    await screen.findByText('Найдено: 46 · Показаны 1–20')
  })
  it('ignores late responses after changing the status filter', async () => {
    const session = await seeded()
    const original = session.applications.list
    let finish!: () => void
    const list = vi.spyOn(session.applications, 'list').mockImplementationOnce(
      (query) =>
        new Promise((resolve) => {
          finish = () => {
            void original(query).then(resolve)
          }
        }),
    )
    start(session)
    await waitFor(() => expect(list).toHaveBeenCalled())
    const signal = list.mock.calls[0][1]
    fireEvent.click(screen.getByRole('button', { name: /Новый/ }))
    await screen.findByText('Найдено: 10 · Показаны 1–10')
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      finish()
    })
    expect(screen.getByText('Найдено: 10 · Показаны 1–10')).toBeInTheDocument()
  })
  it('clamps an out-of-range deep link to the last page', async () => {
    const session = await seeded()
    const router = start(session, '/applications?page=999')
    await screen.findByText('Найдено: 46 · Показаны 41–46')
    expect(router.state.location.search).toBe('?page=3')
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()
  })
  it('leaves contact selectable when clipboard access fails', async () => {
    const session = await seeded()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    start(session, '/applications?status=contacted')
    const dialog = await openFirst()
    fireEvent.click(dialog.getByRole('button', { name: 'Копировать контакт' }))
    await dialog.findByText(/Выделите и скопируйте контакт вручную/)
    expect(dialog.getByText(/Демонстрационный контакт 2/)).toBeInTheDocument()
  })
})
