import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { SessionContext, type Session } from '../session/context'
import { createPreviewSession } from '../../mocks/session'
import { VacanciesPage } from '../../pages/VacanciesPage'
import { VacancyFormPage } from '../../pages/VacancyFormPage'
import { VacancyPage } from '../../pages/VacancyPage'
import { ApiError } from '../../shared/api/client'
import type { Vacancy } from '../../entities/hiring'

vi.mock('@maxhub/max-ui', () => ({
  Button: ({
    children,
    asChild,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean
    variant?: string
    children: ReactNode
  }) => {
    void _variant
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
})
function start(session = createPreviewSession(), path = '/vacancies') {
  const router = createMemoryRouter(
    [
      { path: '/vacancies', element: <VacanciesPage /> },
      { path: '/vacancies/new', element: <VacancyFormPage /> },
      { path: '/vacancies/:id', element: <VacancyPage /> },
      { path: '/vacancies/:id/edit', element: <VacancyFormPage /> },
      { path: '/vacancies/:id/copy', element: <VacancyFormPage copy /> },
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
function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } })
}
async function seed(session: Session) {
  return session.vacancies.create({
    title: 'Повар',
    region_code: 'Тула',
    category: 'Общепит',
    schedule: 'seasonal',
    salary_min: 50000,
    salary_max: null,
    description: 'За месяц',
    contact_info: 'Связаться в MAX',
  })
}
describe('employer vacancy workflow', () => {
  it('shows confirmed delivery when a read resolves a lost response and clears the obsolete error', async () => {
    const session = createPreviewSession()
    session.mode = 'max'
    const row = await seed(session)
    vi.spyOn(session.vacancies, 'get')
      .mockResolvedValueOnce(row)
      .mockResolvedValue({ ...row, status: 'published', cardMessageId: 'confirmed-after-timeout' })
    const publish = vi
      .spyOn(session.vacancies, 'publish')
      .mockRejectedValue(new ApiError('network'))
    start(session, `/vacancies/${row.id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Опубликовать' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Подтвердить публикацию',
      }),
    )
    await screen.findByText(/Проверка подтвердила отправку карточки/)
    expect(screen.getByRole('heading', { name: 'Вакансия опубликована' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(publish).toHaveBeenCalledOnce()
  })
  it('requires checking the chat and explicit confirmation, re-reads the vacancy and prevents duplicate resends', async () => {
    const session = createPreviewSession()
    session.mode = 'max'
    const row = { ...(await seed(session)), status: 'published' as const, cardMessageId: null }
    // Keep the summary's independent read out of the publication request sequence.
    vi.spyOn(session.applications, 'forVacancy').mockResolvedValue({ vacancy: row, items: [] })
    const get = vi.spyOn(session.vacancies, 'get').mockResolvedValue(row)
    let resolve!: (value: Vacancy) => void
    const publish = vi.spyOn(session.vacancies, 'publish').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const router = start(session, `/vacancies/${row.id}`)
    await screen.findByRole('heading', { name: 'Отправка не подтверждена' })
    expect(screen.getByRole('button', { name: 'Повторить отправку' })).toBeDisabled()
    expect(publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /Я проверил чат/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Повторить отправку' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('может появиться дубль')
    expect(publish).not.toHaveBeenCalled()
    const confirm = within(dialog).getByRole('button', { name: 'Отправить повторно' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(get).toHaveBeenCalledTimes(2)
    await act(() => router.navigate('/vacancies'))
    expect(router.state.location.pathname).toBe(`/vacancies/${row.id}`)
    await act(() => resolve({ ...row, cardMessageId: 'confirmed-card' }))
    await screen.findByRole('heading', { name: 'Вакансия опубликована' })
    expect(screen.queryByRole('button', { name: 'Повторить отправку' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/vacancies/${row.id}`)
  })
  it.each(['confirmed', 'closed', 'draft'] as const)(
    'cancels resend if the preflight read reports %s',
    async (state) => {
      const session = createPreviewSession()
      const row = { ...(await seed(session)), status: 'published' as const, cardMessageId: null }
      vi.spyOn(session.vacancies, 'get')
        .mockResolvedValueOnce(row)
        .mockResolvedValue({
          ...row,
          status: state === 'confirmed' ? 'published' : state,
          cardMessageId: state === 'confirmed' ? 'already-sent' : null,
        })
      const publish = vi.spyOn(session.vacancies, 'publish')
      start(session, `/vacancies/${row.id}`)
      fireEvent.click(await screen.findByRole('checkbox', { name: /Я проверил чат/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Повторить отправку' }))
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Отправить повторно',
        }),
      )
      await screen.findByText(
        state === 'confirmed'
          ? /Повторная отправка не понадобилась/
          : /Повторная отправка отменена/,
      )
      expect(publish).not.toHaveBeenCalled()
    },
  )
  it('locks resend after a failed state check and restores it only after a successful read and renewed chat check', async () => {
    const session = createPreviewSession()
    const row = { ...(await seed(session)), status: 'published' as const, cardMessageId: null }
    vi.spyOn(session.applications, 'forVacancy').mockResolvedValue({ vacancy: row, items: [] })
    const get = vi
      .spyOn(session.vacancies, 'get')
      .mockResolvedValueOnce(row)
      .mockRejectedValueOnce(new ApiError('network'))
      .mockResolvedValue(row)
    const publish = vi.spyOn(session.vacancies, 'publish')
    start(session, `/vacancies/${row.id}`)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Я проверил чат/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Повторить отправку' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отправить повторно' }),
    )
    await screen.findByRole('alert')
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Повторить отправку' })).toBeDisabled()
    expect(publish).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Проверить состояние' }))
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled())
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Повторить отправку' })).toBeDisabled()
    expect(publish).not.toHaveBeenCalled()
  })
  it('reconciles a lost publish response without automatically retrying delivery', async () => {
    const session = createPreviewSession()
    session.mode = 'max'
    const row = await seed(session)
    vi.spyOn(session.vacancies, 'get')
      .mockResolvedValueOnce(row)
      .mockResolvedValue({ ...row, status: 'published', cardMessageId: null })
    const publish = vi
      .spyOn(session.vacancies, 'publish')
      .mockRejectedValue(new ApiError('server', 502, 'card_delivery_unknown'))
    start(session, `/vacancies/${row.id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Опубликовать' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Подтвердить публикацию',
      }),
    )
    await screen.findByRole('heading', { name: 'Отправка не подтверждена' })
    expect(screen.getByRole('alert')).toHaveTextContent('Она могла прийти в чат')
    expect(publish).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Повторить отправку' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Проверить состояние' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(publish).toHaveBeenCalledOnce()
  })
  it.each(['draft', 'published', 'closed'] as const)(
    'copies a %s vacancy only after saving, without touching its identity, status or applications',
    async (status) => {
      const session = createPreviewSession()
      const row = await seed(session)
      if (status !== 'draft') await session.vacancies.publish(row.id)
      if (status === 'closed') await session.vacancies.close(row.id)
      const original = await session.vacancies.get(row.id)
      const create = vi.spyOn(session.vacancies, 'create')
      const update = vi.spyOn(session.vacancies, 'update')
      const publish = vi.spyOn(session.vacancies, 'publish')
      const applicationList = vi.spyOn(session.applications, 'forVacancy')
      const applicationUpdate = vi.spyOn(session.applications, 'updateStatus')
      start(session, `/vacancies/${row.id}`)
      fireEvent.click(await screen.findByRole('link', { name: 'Создать копию' }))
      await screen.findByRole('heading', { name: 'Копия вакансии' })
      expect(screen.getByLabelText(/Название вакансии/)).toHaveValue('Повар')
      expect(screen.getByLabelText(/Город или регион/)).toHaveValue('Тула')
      expect(screen.getByLabelText(/Сфера деятельности/)).toHaveValue('Общепит')
      expect(screen.getByLabelText(/Тип занятости/)).toHaveValue('seasonal')
      expect(screen.getByLabelText(/Зарплата от/)).toHaveValue('50000')
      expect(screen.getByLabelText(/Зарплата до/)).toHaveValue('')
      expect(screen.getByLabelText(/Описание работы/)).toHaveValue('За месяц')
      expect(screen.getByLabelText(/Контакт для связи/)).toHaveValue('Связаться в MAX')
      expect(create).not.toHaveBeenCalled()
      type('Название вакансии', 'Повар на новый сезон')
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))
      await screen.findByRole('heading', { name: 'Всё выглядит верно?' })
      expect(create).toHaveBeenCalledOnce()
      expect(create.mock.calls[0][0]).toEqual({
        title: 'Повар на новый сезон',
        region_code: 'Тула',
        category: 'Общепит',
        schedule: 'seasonal',
        salary_min: 50000,
        salary_max: null,
        description: 'За месяц',
        contact_info: 'Связаться в MAX',
      })
      expect(update).not.toHaveBeenCalled()
      expect(publish).not.toHaveBeenCalled()
      // Detail screens read each vacancy's summary; copying must never change applications.
      expect(applicationList.mock.calls.map(([id]) => id)).toEqual([row.id, row.id + 1])
      expect(applicationUpdate).not.toHaveBeenCalled()
      expect(await session.vacancies.get(row.id)).toEqual(original)
      expect(await session.vacancies.get(row.id + 1)).toMatchObject({
        status: 'draft',
        cardMessageId: null,
      })
    },
  )
  it('protects an unsaved copy and lets the employer discard it without creating a record', async () => {
    const session = createPreviewSession()
    const row = await seed(session)
    const create = vi.spyOn(session.vacancies, 'create')
    const router = start(session, `/vacancies/${row.id}/copy`)
    await screen.findByRole('heading', { name: 'Копия вакансии' })
    // The editor mounts after the source resolves; flush the router's blocker registration.
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('link', { name: 'Отмена' }))
    const dialog = await screen.findByRole('dialog')
    expect(router.state.location.pathname).toBe(`/vacancies/${row.id}/copy`)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Выйти без сохранения' }))
    await screen.findByRole('heading', { name: 'Всё выглядит верно?' })
    expect(create).not.toHaveBeenCalled()
    expect(await session.vacancies.list()).toHaveLength(1)
  })
  it.each([403, 404])(
    'does not open a blank copy or write data when the source returns %s',
    async (status) => {
      const session = createPreviewSession()
      vi.spyOn(session.vacancies, 'get').mockRejectedValue(
        new ApiError(status === 403 ? 'forbidden' : 'server', status),
      )
      const create = vi.spyOn(session.vacancies, 'create')
      start(session, '/vacancies/99/copy')
      await screen.findByRole('alert')
      expect(screen.queryByLabelText(/Название вакансии/)).not.toBeInTheDocument()
      expect(create).not.toHaveBeenCalled()
    },
  )
  it('ignores the old source if navigation changes while its request is pending', async () => {
    const session = createPreviewSession()
    const first = await seed(session)
    const second = await seed(session)
    await session.vacancies.update(second.id, {
      title: 'Другая вакансия',
      region_code: 'Москва',
      category: 'Общепит',
      schedule: 'temporary',
      salary_min: null,
      salary_max: 60000,
      description: null,
      contact_info: null,
    })
    let resolve!: (value: Vacancy) => void
    const get = vi.spyOn(session.vacancies, 'get').mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const router = start(session, `/vacancies/${first.id}/copy`)
    await act(() => router.navigate(`/vacancies/${second.id}/copy`))
    await screen.findByRole('heading', { name: 'Копия вакансии' })
    await act(() => resolve(first))
    expect(screen.getByLabelText(/Название вакансии/)).toHaveValue('Другая вакансия')
    expect(screen.getByLabelText(/Зарплата от/)).toHaveValue('')
    expect(screen.getByLabelText(/Зарплата до/)).toHaveValue('60000')
    expect(get.mock.calls[0][1]?.aborted).toBe(true)
  })
  it('blocks duplicate creation after an uncertain save of a copied vacancy', async () => {
    const session = createPreviewSession()
    const row = await seed(session)
    const create = vi.spyOn(session.vacancies, 'create').mockRejectedValue(new ApiError('network'))
    start(session, `/vacancies/${row.id}/copy`)
    await screen.findByRole('heading', { name: 'Копия вакансии' })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))
    await screen.findByText(/Сохранение не подтверждено/)
    expect(screen.getByRole('button', { name: 'Сохранить и проверить' })).toBeDisabled()
    expect(create).toHaveBeenCalledOnce()
    expect(screen.getByLabelText(/Название вакансии/)).toHaveValue('Повар')
  })
  it('keeps salary checking optional, preserves pay inputs and allows saving after a benchmark failure', async () => {
    const session = createPreviewSession()
    const benchmark = vi
      .spyOn(session.benchmark, 'get')
      .mockRejectedValueOnce(new ApiError('server', 404))
    const create = vi.spyOn(session.vacancies, 'create')
    start(session, '/vacancies/new')
    type('Название вакансии', 'Повар')
    type('Регион', 'Тула')
    type('Зарплата от', '50 000')
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть ориентир' }))
    await screen.findByText(/Сейчас ориентир недоступен/)
    expect(create).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Зарплата от/)).toHaveValue('50 000')
    fireEvent.click(screen.getByRole('button', { name: 'Повторить запрос' }))
    await screen.findByText(/45\s000\s₽/)
    expect(screen.getByLabelText(/Зарплата от/)).toHaveValue('50 000')
    benchmark.mockRejectedValueOnce(new ApiError('network'))
    fireEvent.click(screen.getByRole('button', { name: 'Обновить ориентир' }))
    await screen.findByText(/Сейчас ориентир недоступен/)
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))
    await screen.findByRole('heading', { name: 'Всё выглядит верно?' })
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0].salary_min).toBe(50000)
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Посмотреть ориентир' })).toBeEnabled()
    expect(benchmark).toHaveBeenCalledTimes(3)
  })
  it('creates, edits, confirms publication, closes and filters a vacancy without network calls in demo', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const session = createPreviewSession()
    const publish = vi.spyOn(session.vacancies, 'publish')
    const router = start(session)
    fireEvent.click(await screen.findByRole('link', { name: /Создать первую/ }))
    type('Название вакансии', 'Повар в кафе')
    type('Зарплата от', '50 000')
    type('Контакт для связи', 'Анна, MAX')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))
    await screen.findByRole('heading', { name: 'Всё выглядит верно?' })
    expect(publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'Редактировать' }))
    await screen.findByLabelText(/Название вакансии/)
    type('Название вакансии', 'Старший повар')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))
    await screen.findByRole('heading', { name: 'Старший повар' })
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))
    expect(publish).not.toHaveBeenCalled()
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Подтвердить публикацию' }),
    )
    await screen.findByRole('heading', { name: 'Демо-публикация готова' })
    expect(publish).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link', { name: 'Редактировать' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть вакансию' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Да, закрыть' }))
    await screen.findByRole('heading', { name: 'Поиск завершён' })
    await act(() => router.navigate('/vacancies?status=closed&q=повар'))
    expect(await screen.findByRole('heading', { name: 'Старший повар' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'садовник' } })
    expect(await screen.findByText('Ничего не нашлось')).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('validates input and protects an unsaved form during navigation', async () => {
    const session = createPreviewSession(),
      create = vi.spyOn(session.vacancies, 'create')
    start(session, '/vacancies/new')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))
    expect(await screen.findByText('Укажите, кого вы ищете.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    type('Название вакансии', 'Черновик')
    fireEvent.click(screen.getByRole('link', { name: 'Отмена' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(screen.getByLabelText(/Название вакансии/)).toHaveValue('Черновик')
    fireEvent.click(screen.getByRole('link', { name: 'Отмена' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Выйти без сохранения',
      }),
    )
    await screen.findByRole('heading', { name: 'Мои вакансии' })
  })
  it('preserves fields on validation failure and prevents blind duplicate creation after a lost response', async () => {
    const session = createPreviewSession()
    const create = vi
      .spyOn(session.vacancies, 'create')
      .mockRejectedValueOnce(new ApiError('server', 400, 'validation_error', ['title']))
      .mockRejectedValueOnce(new ApiError('network'))
    start(session, '/vacancies/new')
    type('Название вакансии', 'Повар')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))
    expect(await screen.findByText('Проверьте значение этого поля.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Название вакансии/)).toHaveValue('Повар')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))
    await screen.findByText(/Сохранение не подтверждено/)
    expect(screen.getByRole('button', { name: 'Сохранить и проверить' })).toBeDisabled()
    expect(create).toHaveBeenCalledTimes(2)
  })
  it('reconciles a publication conflict and prevents double submission', async () => {
    const session = createPreviewSession(),
      row = await seed(session)
    let reject!: (error: unknown) => void
    const publish = vi.spyOn(session.vacancies, 'publish').mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    start(session, `/vacancies/${row.id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Опубликовать' }))
    const button = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Подтвердить публикацию',
    })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(publish).toHaveBeenCalledOnce()
    await session.vacancies.close(row.id)
    await act(async () => reject(new ApiError('server', 409, 'conflict')))
    expect(await screen.findByRole('heading', { name: 'Поиск завершён' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Статус вакансии уже изменился')
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument()
  })
  it('does not claim MAX delivery if a published response lacks its card ID', async () => {
    const session = createPreviewSession(),
      row = await seed(session)
    session.mode = 'max'
    vi.spyOn(session.vacancies, 'get').mockResolvedValue({
      ...row,
      status: 'published',
      cardMessageId: null,
    })
    start(session, `/vacancies/${row.id}`)
    expect(
      await screen.findByRole('heading', { name: 'Отправка не подтверждена' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Карточка отправлена в чат с ботом.')).not.toBeInTheDocument()
  })
  it('shows a resource permission error without hiding the whole session', async () => {
    const session = createPreviewSession()
    vi.spyOn(session.vacancies, 'get').mockRejectedValue(new ApiError('forbidden', 403))
    start(session, '/vacancies/99')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Нет доступа к этой вакансии'),
    )
  })
})
