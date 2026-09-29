import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createPreviewSession } from '../../mocks/session'
import { SessionContext, type Session } from '../session/context'
import { VacancyHiringSummary } from './VacancyHiringSummary'
import type { VacancyStatus } from '../../entities/hiring'

function start(session: Session, status: VacancyStatus = 'published') {
  return render(
    <SessionContext value={session}>
      <MemoryRouter>
        <VacancyHiringSummary vacancy={{ id: 1, status }} paused={false} />
      </MemoryRouter>
    </SessionContext>,
  )
}

describe('vacancy hiring summary', () => {
  it('shows scoped totals and links every stage to this vacancy, including closed vacancies', async () => {
    const session = createPreviewSession()
    await session.loadApplicationExamples!()
    await session.vacancies.close(1)
    start(session, 'closed')
    const region = within(screen.getByRole('region', { name: 'Отклики по этапам' }))
    expect(await region.findByRole('link', { name: 'Новый: 5. Открыть отклики' })).toHaveAttribute(
      'href',
      '/applications?vacancy=1&status=new',
    )
    expect(region.getByText(/Всего откликов:/)).toHaveTextContent('Всего откликов: 23')
    expect(region.getByRole('link', { name: 'Все отклики' })).toHaveAttribute(
      'href',
      '/applications?vacancy=1',
    )
    for (const link of region.getAllByRole('link').slice(1)) {
      expect(link.getAttribute('href')).toMatch(/^\/applications\?vacancy=1&status=/)
    }
  })

  it.each(['draft', 'published', 'closed'] as const)(
    'distinguishes an empty %s vacancy from a load failure',
    async (status) => {
      const session = createPreviewSession()
      vi.spyOn(session.applications, 'forVacancy').mockResolvedValue({
        vacancy: { id: 1, title: 'Повар', status },
        items: [],
      })
      start(session, status)
      await screen.findByRole('link', { name: 'Новый: 0. Открыть отклики' })
      expect(screen.getByText(/Всего откликов:/)).toHaveTextContent('Всего откликов: 0')
      expect(screen.getByRole('region')).toHaveTextContent(
        status === 'draft'
          ? 'Опубликуйте вакансию'
          : status === 'closed'
            ? 'новые отклики не принимаются'
            : 'Поделитесь опубликованной карточкой',
      )
    },
  )

  it('reports failure without zero counts and retries without losing the vacancy scope', async () => {
    const session = createPreviewSession()
    await session.loadApplicationExamples!()
    vi.spyOn(session.applications, 'forVacancy').mockRejectedValueOnce(new Error('offline'))
    start(session)
    await screen.findByText('Не удалось загрузить количество откликов.')
    expect(screen.getByText(/Всего откликов:/)).toHaveTextContent('Всего откликов: —')
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await screen.findByRole('link', { name: 'Новый: 5. Открыть отклики' })
    await session.applications.updateStatus(1, 'hired')
    fireEvent.click(screen.getByRole('button', { name: 'Обновить воронку' }))
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Новый: 4. Открыть отклики' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: 'Нанят: 5. Открыть отклики' })).toBeInTheDocument()
  })
})
