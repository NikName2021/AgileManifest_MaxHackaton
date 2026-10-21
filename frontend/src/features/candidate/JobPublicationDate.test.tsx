import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MaxUI } from '@maxhub/max-ui'
import { JobPublicationDate } from './JobPublicationDate'

describe('publication date tooltip', () => {
  it('opens for keyboard users, describes the date, and closes with Escape or outside tap', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    render(
      <MaxUI>
        <JobPublicationDate value={new Date().toISOString()} />
      </MaxUI>,
    )
    const trigger = screen.getByRole('button', { name: 'Дата публикации: Сегодня' })
    fireEvent.focus(trigger)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Дата публикации вакансии')
    expect(trigger).toHaveAccessibleDescription('Дата публикации вакансии')
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.getByRole('tooltip')).toBeVisible()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
