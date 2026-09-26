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
    expect(await screen.findByRole('heading', { name: 'Проверяем карточку' })).toBeInTheDocument()
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
