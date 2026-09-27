import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { SessionContext, type Session } from '../features/session/context'
import { createPreviewSession } from '../mocks/session'
import { OverviewPage } from './OverviewPage'

vi.mock('@maxhub/max-ui', () => ({
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
    const metrics = start(session)
    await screen.findByRole('heading', { name: 'Бариста в летнее кафе · демо' })
    expect(metrics.getByRole('link', { name: /Активные вакансии/ })).toHaveTextContent('2')
    const fresh = metrics.getByRole('link', { name: /Новые отклики/ })
    expect(fresh).toHaveTextContent('10')
    expect(fresh).toHaveAttribute('href', '/applications?status=new')
    expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('46')
    expect(metrics.getByRole('link', { name: /Черновики/ })).toHaveTextContent('0')
  })
  it('shows an honest empty state without fabricated vacancies or candidates', async () => {
    const metrics = start(createPreviewSession())
    await screen.findByRole('heading', { name: 'Добавьте первую вакансию' })
    expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('0')
    expect(screen.queryByText(/демо 1/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Создать черновик/ })).toHaveAttribute(
      'href',
      '/vacancies/new',
    )
  })
  it('does not turn unavailable metrics into zero and recovers independently of vacancies', async () => {
    const session = createPreviewSession()
    const original = session.applications.list
    const list = vi.spyOn(session.applications, 'list').mockRejectedValue(new Error('offline'))
    const metrics = start(session)
    await screen.findByText('Не удалось загрузить количество откликов.')
    expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('—')
    expect(
      await screen.findByRole('heading', { name: 'Добавьте первую вакансию' }),
    ).toBeInTheDocument()
    list.mockImplementation(original)
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() =>
      expect(metrics.getByRole('link', { name: /Всего откликов/ })).toHaveTextContent('0'),
    )
    expect(screen.queryByText('Не удалось загрузить количество откликов.')).not.toBeInTheDocument()
  })
})
