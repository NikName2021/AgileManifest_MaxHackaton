import { describe, expect, it, vi } from 'vitest'
import { categoryLabel, parseCategories, suggestCategories } from './api'
import { ApiError } from '../../shared/api/client'
import { fieldError } from '../../shared/api/fieldError'
import { parseChannel } from '../partners/api'
import { suggestBadges } from '../badges/api'

describe('employer review contracts', () => {
  it('loads badge suggestions with query parameters outside the validated API path', async () => {
    const items = [{ key: 'housing_free', emoji: '🏠', label: 'Жильё бесплатно', group: 'housing' }]
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items })))
    vi.stubGlobal('fetch', fetcher)
    expect(await suggestBadges('жил', ['meals_3'], false)).toMatchObject([{ key: 'housing_free' }])
    const url = new URL(String(fetcher.mock.calls[0][0]))
    expect(url.pathname).toBe('/api/badges/suggest')
    expect(url.searchParams.get('exclude')).toBe('meals_3')
    expect(url.searchParams.get('q')).toBe('жил')
  })
  it('keeps categories with no published jobs and rejects invalid counts', () => {
    const items = [{ name: 'Общепит', emoji: '🍽️', vacancies: 0 }]
    expect(parseCategories({ items })).toEqual(items)
    expect(() => parseCategories({ items: [{ ...items[0], vacancies: -1 }] })).toThrow()
    expect(categoryLabel('Другое', 'Ремонт обуви')).toBe('📌 Другое · Ремонт обуви')
  })
  it('uses server resolution for free text and sends an encoded query', async () => {
    const body = {
      resolved: { name: 'Общепит', match: 'synonym', detail: null },
      items: [{ name: 'Общепит', emoji: '🍽️', vacancies: 0 }],
    }
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)))
    vi.stubGlobal('fetch', fetcher)
    expect(await suggestCategories('кафе & кухня', false)).toEqual(body)
    expect(String(fetcher.mock.calls[0][0])).toContain(
      new URLSearchParams({ q: 'кафе & кухня', limit: '8' }).toString(),
    )
  })
  it.each([
    ['title', 'must not contain a phone', 'контакт указывается в отдельном поле'],
    ['description', 'exceeds MAX limit of 4000', 'сократите описание'],
    ['category', 'must contain letters or digits', 'Напишите словами'],
    ['contact_info', 'contact_info must be up to 3 contacts', 'до 3 через запятую'],
    ['badges', 'at most 10 badges', 'Не больше 10'],
  ])('translates the server error for %s', (field, message, text) => {
    const error = new ApiError('server', 400, 'validation_error', [field], { [field]: [message] })
    expect(fieldError(error, field)).toContain(text)
    expect(fieldError(error, 'unrelated')).toBeUndefined()
  })
  it('preserves the full partner filter and statistics contract', () => {
    const channel = {
      id: 1,
      title: 'Студенты',
      isChannel: true,
      active: true,
      region: null,
      studentOnly: true,
      removed: false,
      createdAt: '2026-10-20T00:00:00Z',
      categories: ['Общепит'],
      schedule: 'seasonal',
      salaryFrom: 40000,
      trustedOnly: true,
      badges: [],
      mode: 'digest',
      digestHour: 10,
      stats: {
        vacanciesPosted: 12,
        applications: 7,
        hired: 2,
        lastPostedAt: '2026-10-21T07:00:00Z',
      },
    }
    expect(parseChannel(channel)).toEqual(channel)
    expect(() => parseChannel({ ...channel, digestHour: 24 })).toThrow()
    expect(() => parseChannel({ ...channel, stats: { ...channel.stats, hired: -1 } })).toThrow()
  })
})
