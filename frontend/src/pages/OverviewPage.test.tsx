import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { SessionContext, type Session } from '../features/session/context'
import { createPreviewSession } from '../mocks/session'
import { OverviewPage } from './OverviewPage'
import { statuses } from '../features/applications/api'
import { applicationLabels } from '../entities/hiring'

vi.mock('@maxhub/max-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@maxhub/max-ui')>()),
  Button: ({
    children,
    asChild,
    onClick,
  }: {
    children: ReactNode
    asChild?: boolean
    onClick?: () => void
  }) => (asChild ? children : <button onClick={onClick}>{children}</button>),
}))
function start(session: Session) {
  render(
    <SessionContext value={session}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </SessionContext>,
  )
  return within(screen.getByRole('region', { name: 'Сводка найма' }))
}
describe('hiring overview', () => {
  it('shows actual totals, not the one-item page length, and links to matching filters', async () => {
    const session = createPreviewSession()
    await session.loadApplicationExamples!()
    const list = vi.spyOn(session.applications, 'list')
    const metrics = start(session)
    await screen.findByRole('link', { name: 'Новый: 10. Открыть отклики' })
    expect(metrics.getByRole('link', { name: /Активные вакансии/ })).toHaveTextContent('2')
    const fresh = metrics.getByRole('link', { name: /Новые отклики/ })
    expect(fresh).toHaveTextContent('10')
    expect(fresh).toHaveAttribute('href', '/applications?status=new')
    expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('46')
    expect(metrics.getByRole('link', { name: /Черновики/ })).toHaveTextContent('0')
    expect(list).toHaveBeenCalledWith(
      { status: 'new', limit: 3, offset: 0 },
      expect.any(AbortSignal),
    )
    expect(screen.getByRole('link', { name: /Анна · демо 1\s*Бариста/ })).toHaveAttribute(
      'href',
      '/applications?vacancy=1&status=new',
    )
    const funnel = within(screen.getByRole('region', { name: 'Этапы найма' }))
    const expected = [10, 10, 10, 8, 8]
    statuses.forEach((status, index) => {
      const link = funnel.getByRole('link', {
        name: `${applicationLabels[status]}: ${expected[index]}. Открыть отклики`,
      })
      expect(link).toHaveAttribute('href', `/applications?status=${status}`)
    })
  })
  it('shows an honest empty state without fabricated vacancies or candidates', async () => {
    const metrics = start(createPreviewSession())
    await screen.findByRole('heading', { name: 'Все новые отклики разобраны' })
    expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('0')
    expect(screen.queryByText(/демо 1/)).not.toBeInTheDocument()
    expect(await screen.findByText(/Откликов пока нет. Поделитесь/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Создать вакансию/ })[0]).toHaveAttribute(
      'href',
      '/vacancies/new',
    )
  })
  it('shows loading instead of zero and disables refresh while requests are pending', () => {
    const session = createPreviewSession()
    vi.spyOn(session.applications, 'list').mockImplementation(() => new Promise(() => {}))
    start(session)
    expect(screen.getByRole('region', { name: 'Этапы найма' })).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.getByRole('link', { name: 'Нанят: загружается. Открыть отклики' }),
    ).toHaveTextContent('—')
    expect(screen.queryByRole('button', { name: /Обновить/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Откликов пока нет/)).not.toBeInTheDocument()
  })
  it('retains independent totals on partial failure and recovers a missing stage', async () => {
    const session = createPreviewSession()
    await session.loadApplicationExamples!()
    const original = session.applications.list
    const list = vi.spyOn(session.applications, 'list').mockImplementation((query, signal) => {
      if (query.status === 'hired') return Promise.reject(new Error('offline'))
      return original(query, signal)
    })
    const metrics = start(session)
    await screen.findByText(/Часть показателей недоступна/)
    expect(
      screen.getByRole('link', { name: 'Нанят: недоступно. Открыть отклики' }),
    ).toHaveTextContent('—')
    expect(screen.getByRole('link', { name: 'Новый: 10. Открыть отклики' })).toBeInTheDocument()
    expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('46')
    list.mockImplementation(original)
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(
      await screen.findByRole('link', { name: 'Нанят: 8. Открыть отклики' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Часть показателей недоступна/)).not.toBeInTheDocument()
  })
  it('refreshes the overview after returning from a status change', async () => {
    const session = createPreviewSession()
    await session.loadApplicationExamples!()
    const vacancyList = vi.spyOn(session.vacancies, 'list')
    const applicationList = vi.spyOn(session.applications, 'list')
    const metrics = start(session)
    await screen.findByRole('link', { name: 'Новый: 10. Открыть отклики' })
    await session.applications.updateStatus(1, 'hired')
    fireEvent.focus(window)
    await screen.findByRole('link', { name: 'Новый: 9. Открыть отклики' })
    expect(screen.getByRole('link', { name: 'Нанят: 9. Открыть отклики' })).toBeInTheDocument()
    expect(metrics.getByRole('link', { name: /Новые отклики/ })).toHaveTextContent('9')
    expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('46')
    expect(vacancyList).toHaveBeenCalledTimes(2)
    expect(applicationList).toHaveBeenCalledTimes(14)
  })
  it('does not turn unavailable metrics into zero and recovers independently of vacancies', async () => {
    const session = createPreviewSession()
    const original = session.applications.list
    const list = vi.spyOn(session.applications, 'list').mockRejectedValue(new Error('offline'))
    const metrics = start(session)
    await screen.findByText('Не удалось загрузить количество откликов.')
    expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('—')
    expect(await screen.findByText('Не удалось загрузить новые отклики.')).toBeInTheDocument()
    list.mockImplementation(original)
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() =>
      expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('0'),
    )
    expect(screen.queryByText('Не удалось загрузить количество откликов.')).not.toBeInTheDocument()
  })
})
