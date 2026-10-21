import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ApplicationRoadmap } from './ApplicationRoadmap'
import { parseTimeline, timelineKeys, type ApplicationTimeline } from './model'

const labels = [
  'Отклик отправлен',
  'Просмотрен',
  'Связались',
  'Приглашён',
  'Выход подтверждён',
  'Нанят',
]
function timeline(): ApplicationTimeline {
  return {
    current: 'invited',
    outcome: null,
    steps: timelineKeys.map((key, i) => ({
      key,
      label: labels[i],
      emoji: '',
      hint: 'Этап рассмотрения',
      state: i === 1 ? 'skipped' : i < 3 ? 'done' : i === 3 ? 'current' : 'upcoming',
      reachedAt: i < 4 && i !== 1 ? '2026-10-20T09:30:00Z' : null,
    })),
  }
}
describe('application roadmap', () => {
  it('keeps skipped stages distinct and exposes date and time on focus and tap', () => {
    const data = parseTimeline(timeline())
    render(<ApplicationRoadmap timeline={data} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    const current = screen.getByRole('button', { name: /Приглашён/ })
    expect(current).toHaveAttribute('aria-current', 'step')
    fireEvent.focus(current)
    fireEvent.click(current)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/20.10.2026.*\d{2}\.\d{2}/)
    fireEvent.keyDown(current, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Просмотрен. Этап пропущен/ }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Этап пропущен')
  })
  it.each(['rejected', 'vacancy_closed'] as const)(
    'truncates future stages for %s and shows the terminal event',
    (key) => {
      render(
        <ApplicationRoadmap
          timeline={{
            ...timeline(),
            outcome: {
              key,
              emoji: '',
              label: 'Рассмотрение завершено',
              reachedAt: '2026-10-21T09:00:00Z',
            },
          }}
        />,
      )
      expect(screen.getAllByRole('listitem')).toHaveLength(5)
      const lastReached = screen.getByRole('button', { name: /Приглашён/ })
      expect(lastReached.closest('li')).toHaveClass('done')
      expect(lastReached).not.toHaveAttribute('aria-current')
      expect(screen.getByRole('button', { name: /Просмотрен/ }).closest('li')).toHaveClass(
        'skipped',
      )
      expect(
        screen.queryByRole('button', { name: /Выход подтверждён|Нанят/ }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Рассмотрение завершено/ }).closest('li'),
      ).toHaveClass('terminal')
    },
  )
  it('rejects invalid server steps and does not invent events when history is absent', () => {
    expect(() => parseTimeline({ ...timeline(), steps: timeline().steps.reverse() })).toThrow()
    expect(() =>
      parseTimeline({
        ...timeline(),
        steps: timeline().steps.map((s) => ({ ...s, reachedAt: 'invalid' })),
      }),
    ).toThrow()
    render(<ApplicationRoadmap />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText(/История этапов пока недоступна/)).toBeInTheDocument()
  })
})
