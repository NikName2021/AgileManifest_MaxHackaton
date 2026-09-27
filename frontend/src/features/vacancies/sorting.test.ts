import { describe, expect, it } from 'vitest'
import type { Vacancy } from '../../entities/hiring'
import { parseVacancySort, sortVacancies } from './sorting'

const vacancy: Vacancy = {
  id: 1,
  title: 'Повар',
  regionCode: 'Тула',
  category: 'Общепит',
  schedule: 'seasonal',
  salaryMin: null,
  salaryMax: null,
  description: null,
  contactInfo: null,
  status: 'draft',
  cardMessageId: null,
  createdAt: '2026-09-27T10:00:00Z',
}

describe('vacancy sorting', () => {
  it('compares instants across time zones and orders equal timestamps consistently without changing the source', () => {
    const rows = Object.freeze([
      { ...vacancy, id: 2, createdAt: '2026-09-27T12:00:00+03:00' },
      { ...vacancy, id: 1 },
      { ...vacancy, id: 3 },
    ])
    expect(sortVacancies(rows, 'newest').map((row) => row.id)).toEqual([3, 1, 2])
    expect(sortVacancies(rows, 'oldest').map((row) => row.id)).toEqual([2, 1, 3])
    expect(rows.map((row) => row.id)).toEqual([2, 1, 3])
  })
  it('sorts Russian titles naturally, ignores case and outer spaces, and breaks ties by date and id', () => {
    const rows = [
      { ...vacancy, id: 1, title: 'Повар 10' },
      { ...vacancy, id: 2, title: ' Повар 2 ' },
      { ...vacancy, id: 3, title: 'Бариста' },
      { ...vacancy, id: 4, title: 'повар 2' },
    ]
    expect(sortVacancies(rows, 'title').map((row) => row.id)).toEqual([3, 4, 2, 1])
  })
  it('defaults unknown URL values to newest', () => {
    for (const value of [null, '', 'newest', 'constructor', 'TITLE', 'salary']) {
      expect(parseVacancySort(value)).toBe('newest')
    }
    expect(parseVacancySort('title')).toBe('title')
    expect(parseVacancySort('oldest')).toBe('oldest')
    expect(sortVacancies([], 'title')).toEqual([])
  })
})
