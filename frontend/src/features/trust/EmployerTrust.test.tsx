import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmployerBadge } from './EmployerTrust'
import { hasEmployerBadge } from './model'
import { parseProfile } from '../candidate/api'
describe('five confirmed hires', () => {
  it.each([undefined, 0, 4, NaN, 5.5])('does not give a badge for %s', (count) =>
    expect(hasEmployerBadge(count)).toBe(false),
  )
  it('accepts five hires even when the previous server rule requires two vacancies', () => {
    const profile = parseProfile({
      id: 1,
      displayName: 'Ирина',
      applicationContact: null,
      hasBotChat: true,
      employerTrust: { trusted: false, confirmedHires: 5, threshold: 5 },
    })
    render(<EmployerBadge confirmedHires={profile.employerTrust?.confirmedHires} />)
    expect(screen.getByText('Надёжный работодатель')).toBeInTheDocument()
    expect(hasEmployerBadge(6)).toBe(true)
  })
})
