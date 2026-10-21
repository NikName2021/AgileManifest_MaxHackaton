import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Outlet, useBlocker } from 'react-router-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { SessionContext } from '../session/context'
import { ThemeContext } from '../appearance/context'
import { CabinetGate } from '../cabinet/CabinetGate'
import { useCabinet } from '../cabinet/context'
import { createPreviewSession } from '../../mocks/session'
import { JobsPage } from '../../pages/JobsPage'
import { JobPage } from '../../pages/JobPage'
import { MyApplicationsPage } from '../../pages/MyApplicationsPage'
import { WorkerProfilePage } from '../../pages/WorkerProfilePage'
import { SubscriptionsPage } from '../../pages/SubscriptionsPage'
import { ApiError } from '../../shared/api/client'

vi.mock('@maxhub/max-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@maxhub/max-ui')>()),
  Button: ({
    children,
    asChild,
    variant,
    iconBefore,
    iconAfter,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean
    variant?: string
    iconBefore?: ReactNode
    iconAfter?: ReactNode
    children: ReactNode
  }) => {
    void variant
    return asChild ? (
      children
    ) : (
      <button {...props}>
        {iconBefore}
        {children}
        {iconAfter}
      </button>
    )
  },
}))
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
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
})
function Frame() {
  const { switchCabinet } = useCabinet()
  return (
    <>
      <button onClick={switchCabinet}>Выйти</button>
      <Outlet />
    </>
  )
}
function start(session = createPreviewSession(), path = '/') {
  const router = createMemoryRouter(
    [
      {
        element: (
          <CabinetGate>
            <Frame />
          </CabinetGate>
        ),
        children: [
          { path: '/', element: <h1>Обзор работодателя</h1> },
          { path: '/vacancies', element: <h1>Свои вакансии</h1> },
          { path: '/choose', element: null },
          { path: '/jobs', element: <JobsPage /> },
          { path: '/jobs/:id', element: <JobPage /> },
          { path: '/my-applications', element: <MyApplicationsPage /> },
          { path: '/profile', element: <WorkerProfilePage /> },
          { path: '/channels', element: <h1>Каналы партнёра</h1> },
          { path: '/subscriptions', element: <SubscriptionsPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  const rendered = render(
    <SessionContext value={session}>
      <ThemeContext value={{ preference: 'system', setPreference: vi.fn() }}>
        <RouterProvider router={router} />
      </ThemeContext>
    </SessionContext>,
  )
  return { router, ...rendered }
}
function worker() {
  fireEvent.click(screen.getByRole('button', { name: /Зайти как работник/ }))
}

describe('cabinet selection and candidate flows', () => {
  it('saves the selected category value and confirms deletion from the icon', async () => {
    const session = createPreviewSession()
    vi.spyOn(session.candidate, 'filters').mockResolvedValue({
      regions: [],
      categories: [{ value: 'agriculture', label: 'Сельское хозяйство' }],
    })
    const create = vi.spyOn(session.subscriptions!, 'create')
    const remove = vi.spyOn(session.subscriptions!, 'remove')
    start(session, '/subscriptions')
    worker()
    const category = await screen.findByRole('combobox', { name: 'Сфера деятельности' })
    await waitFor(() => expect(category).toBeEnabled())
    fireEvent.click(category)
    fireEvent.click(screen.getByRole('radio', { name: 'Сельское хозяйство' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить подписку' }))
    await screen.findByRole('heading', { name: 'Мои подписки (1/5)' })
    expect(create).toHaveBeenCalledExactlyOnceWith({
      category: 'agriculture',
      region_code: null,
      schedule: null,
      salary_from: null,
      student_only: false,
    })
    fireEvent.click(screen.getByRole('button', { name: /Удалить подписку:/ }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Удалить подписку:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
    await screen.findByRole('heading', { name: 'Мои подписки (0/5)' })
    expect(remove).toHaveBeenCalledExactlyOnceWith(1)
  })
  it('retries failed subscription categories before allowing save', async () => {
    const session = createPreviewSession()
    vi.spyOn(session.candidate, 'filters').mockRejectedValueOnce(new ApiError('network'))
    start(session, '/subscriptions')
    worker()
    const retry = await screen.findByRole('button', { name: 'Повторить загрузку сфер' })
    expect(screen.getByRole('button', { name: 'Сохранить подписку' })).toBeDisabled()
    fireEvent.click(retry)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Сохранить подписку' })).toBeEnabled(),
    )
    expect(screen.getByRole('combobox', { name: 'Сфера деятельности' })).toHaveTextContent(
      'Любая сфера',
    )
  })
  it('shows the employer section even without a hiring quota or trust statistics', async () => {
    const session = createPreviewSession()
    start(session, '/jobs/1002')
    worker()
    const employer = await screen.findByRole('region', { name: 'Работодатель' })
    expect(within(employer).getByText('Демо: загородный отель')).toBeVisible()
    expect(within(employer).queryByText('Надёжный работодатель')).not.toBeInTheDocument()
  })
  it('shows the search loader until the pending vacancy request completes', async () => {
    const session = createPreviewSession()
    const data = await session.candidate.jobs({ sort: 'newest', limit: 20, offset: 0 })
    let finish!: (value: typeof data) => void
    vi.spyOn(session.candidate, 'jobs').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    start(session)
    worker()
    expect(await screen.findByRole('status', { name: 'Ищем вакансии…' })).toBeVisible()
    expect(screen.queryByText('Пока нет подходящих вакансий')).not.toBeInTheDocument()
    await act(async () => {
      finish(data)
    })
    expect(await screen.findByRole('heading', { name: 'Помощник на сбор урожая' })).toBeVisible()
    expect(screen.queryByRole('status', { name: 'Ищем вакансии…' })).not.toBeInTheDocument()
  })
  it('keeps partner channels separate and permits worker subscriptions after leaving', async () => {
    const { router } = start(createPreviewSession(), '/channels')
    fireEvent.click(screen.getByRole('button', { name: /Зайти как партнёр/ }))
    expect(await screen.findByRole('heading', { name: 'Каналы партнёра' })).toBeInTheDocument()
    await act(() => router.navigate('/jobs'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/channels'))
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    worker()
    await screen.findByText('Помощник на сбор урожая')
    await act(() => router.navigate('/subscriptions'))
    expect(await screen.findByRole('heading', { name: 'Подписки на вакансии' })).toBeInTheDocument()
    await act(() => router.navigate('/channels'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/jobs'))
  })
  it('keeps the cabinet mounted when leaving is blocked by an active operation', async () => {
    function BusyPage() {
      const blocker = useBlocker(true)
      return (
        <>
          <h1>Сохранение вакансии</h1>
          {blocker.state === 'blocked' && (
            <button onClick={() => blocker.proceed()}>Сохранение завершено</button>
          )}
        </>
      )
    }
    const router = createMemoryRouter([
      {
        element: (
          <CabinetGate>
            <Frame />
          </CabinetGate>
        ),
        children: [
          { path: '/', element: <BusyPage /> },
          { path: '/choose', element: null },
        ],
      },
    ])
    render(
      <SessionContext value={createPreviewSession()}>
        <RouterProvider router={router} />
      </SessionContext>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Зайти как работодатель/ }))
    await screen.findByRole('heading', { name: 'Сохранение вакансии' })
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(screen.queryByRole('heading', { name: 'С чего начнём?' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранение завершено' }))
    expect(await screen.findByRole('heading', { name: 'С чего начнём?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/choose')
  })
  it('asks at every mount, defers candidate requests and keeps employer overview', async () => {
    const session = createPreviewSession(),
      jobs = vi.spyOn(session.candidate, 'jobs')
    const first = start(session)
    expect(jobs).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Зайти как работодатель/ }))
    expect(await screen.findByRole('heading', { name: 'Обзор работодателя' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    worker()
    expect(await screen.findByText('Помощник на сбор урожая')).toBeInTheDocument()
    first.unmount()
    start(session)
    expect(screen.getByRole('heading', { name: 'С чего начнём?' })).toBeInTheDocument()
  })
  it('guards employer routes in worker mode and preserves a worker deep link after choosing', async () => {
    const { router } = start(undefined, '/jobs/1002')
    worker()
    expect(
      await screen.findByRole('heading', { name: 'Повар в загородный отель' }),
    ).toBeInTheDocument()
    await act(() => router.navigate('/vacancies'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/jobs'))
    expect(screen.queryByText('Свои вакансии')).not.toBeInTheDocument()
  })
  it('saves profile contact, requires confirmation and keeps the application across cabinet switches', async () => {
    const session = createPreviewSession(),
      apply = vi.spyOn(session.candidate, 'apply')
    const { router } = start(session, '/profile')
    worker()
    fireEvent.change(await screen.findByLabelText('Телефон или контакт в MAX'), {
      target: { value: '@candidate' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить контакт' }))
    expect(await screen.findByText('Контакт сохранён.')).toBeInTheDocument()
    await act(() => router.navigate('/jobs/1001'))
    fireEvent.click(await screen.findByRole('button', { name: 'Откликнуться' }))
    expect(await screen.findByLabelText('Контакт для работодателя')).toHaveValue('@candidate')
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отклик' }))
    expect(await screen.findByRole('heading', { name: 'Вы откликнулись' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    fireEvent.click(screen.getByRole('button', { name: /Зайти как работодатель/ }))
    expect(await screen.findByRole('heading', { name: 'Обзор работодателя' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Выйти' }))
    worker()
    expect(
      await screen.findByRole('heading', { name: /Найди работу за\sпару\sкликов/ }),
    ).toBeInTheDocument()
    await act(() => router.navigate('/my-applications'))
    expect(await screen.findByRole('heading', { name: 'Мои отклики' })).toBeInTheDocument()
    const application = await screen.findByRole('article')
    expect(
      within(application).getByRole('heading', { name: 'Помощник на сбор урожая' }),
    ).toBeInTheDocument()
    fireEvent.click(within(application).getByText('Условия и ваш отклик'))
    expect(within(application).queryByText('Контакт работодателя')).not.toBeInTheDocument()
    expect(within(application).getByText('@candidate')).toBeVisible()
    expect(apply).toHaveBeenCalledExactlyOnceWith(1001, '@candidate')
  })
  it('checks an ambiguous POST before enabling retry and never posts automatically', async () => {
    const session = createPreviewSession(),
      original = session.candidate.apply
    const apply = vi.spyOn(session.candidate, 'apply').mockImplementation(async (id, contact) => {
      await original(id, contact)
      throw new ApiError('network')
    })
    start(session, '/jobs/1001')
    worker()
    fireEvent.click(await screen.findByRole('button', { name: 'Откликнуться' }))
    fireEvent.change(await screen.findByLabelText('Контакт для работодателя'), {
      target: { value: '@candidate' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отклик' }))
    const check = await screen.findByRole('button', { name: 'Проверить отклик' })
    fireEvent.submit(screen.getByLabelText('Контакт для работодателя').closest('form')!)
    expect(apply).toHaveBeenCalledOnce()
    fireEvent.click(check)
    expect(await screen.findByRole('heading', { name: 'Вы откликнулись' })).toBeInTheDocument()
    expect(apply).toHaveBeenCalledOnce()
  })
  it('preserves saved success when notification fails', async () => {
    const session = createPreviewSession()
    session.mode = 'max'
    start(session, '/jobs/1001')
    worker()
    fireEvent.click(await screen.findByRole('button', { name: 'Откликнуться' }))
    fireEvent.change(await screen.findByLabelText('Контакт для работодателя'), {
      target: { value: '@candidate' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отклик' }))
    expect(await screen.findByText(/Отклик сохранён и доступен работодателю/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить отклик' })).not.toBeInTheDocument()
  })
  it('validates empty contact and blocks own-vacancy applications', async () => {
    const session = createPreviewSession(),
      apply = vi.spyOn(session.candidate, 'apply')
    const first = start(session, '/jobs/1001')
    worker()
    fireEvent.click(await screen.findByRole('button', { name: 'Откликнуться' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Отправить отклик' }))
    expect(screen.getByText(/Укажите контакт для связи/)).toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
    first.unmount()
    const job = await session.candidate.job(1001)
    vi.spyOn(session.candidate, 'job').mockResolvedValue({
      ...job,
      canApply: false,
      applyUnavailableReason: 'own_vacancy',
    })
    start(session, '/jobs/1001')
    worker()
    expect(await screen.findByText(/Это ваша вакансия/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить отклик' })).not.toBeInTheDocument()
  })
  it('shows no apply form for a closed vacancy and retains closed history', async () => {
    const session = createPreviewSession()
    await session.candidate.apply(1001, '@candidate')
    const history = await session.candidate.applications({ limit: 20, offset: 0 })
    history.items[0].vacancy.status = 'closed'
    vi.spyOn(session.candidate, 'applications').mockResolvedValue(history)
    vi.spyOn(session.candidate, 'job').mockRejectedValue(new ApiError('server', 404, 'not_found'))
    const { router } = start(session, '/jobs/1001')
    worker()
    expect(await screen.findByText(/Вакансия больше не доступна/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить отклик' })).not.toBeInTheDocument()
    await act(() => router.navigate('/my-applications'))
    expect(await screen.findByText(/Ваш отклик остаётся в истории/)).toBeInTheDocument()
  })
  it('applies server filters and resets offset on a new search', async () => {
    const session = createPreviewSession(),
      jobs = vi.spyOn(session.candidate, 'jobs')
    const { router } = start(session, '/jobs?offset=20')
    worker()
    fireEvent.change(await screen.findByLabelText('Поиск по названию вакансии'), {
      target: { value: 'повар' },
    })
    expect(screen.queryByRole('button', { name: 'Найти вакансии' })).not.toBeInTheDocument()
    expect(
      await screen.findByText('Повар в загородный отель', {}, { timeout: 2000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Помощник на сбор урожая')).not.toBeInTheDocument()
    expect(jobs.mock.calls.at(-1)?.[0]).toMatchObject({ q: 'повар', offset: 0 })
    expect(router.state.location.search).not.toContain('offset')
  })
})
