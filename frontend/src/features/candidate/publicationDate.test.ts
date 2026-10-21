import { describe, expect, it } from 'vitest'
import { formatPublicationDate } from './publicationDate'

describe('vacancy publication date', () => {
  it('uses today for a publication on the same local calendar day', () => {
    const now = new Date(2026, 9, 21, 23, 59)
    expect(formatPublicationDate(new Date(2026, 9, 21, 0, 1).toISOString(), now)).toBe('Сегодня')
  })

  it('uses yesterday across a year boundary even when less than a minute has passed', () => {
    const now = new Date(2027, 0, 1, 0, 0, 10)
    expect(formatPublicationDate(new Date(2026, 11, 31, 23, 59, 50).toISOString(), now)).toBe(
      'Вчера',
    )
  })

  it('shows the date for older publications even when less than 48 hours have passed', () => {
    const now = new Date(2026, 2, 1, 0, 1)
    expect(formatPublicationDate(new Date(2026, 1, 27, 23, 59).toISOString(), now)).toBe(
      '27.02.2026',
    )
  })

  it('does not show a broken date when the API value is invalid', () => {
    expect(formatPublicationDate('invalid')).toBe('Дата не указана')
  })
})
