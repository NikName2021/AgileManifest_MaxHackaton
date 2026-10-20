import { afterEach, expect, it, vi } from 'vitest'
import { createSubscriptionRepository, parseSubscription } from './api'

afterEach(() => vi.unstubAllGlobals())
it('deletes subscriptions with an authenticated 204 response', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  await expect(createSubscriptionRepository('https://example.com', 'session', vi.fn()).remove(3)).resolves.toBeUndefined()
  expect(fetch.mock.calls[0][0]).toBe('https://example.com/api/me/subscriptions/3')
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer session' } })
})
it('validates subscription filters', () => {
  const s = { id: 1, region: null, category: null, schedule: 'temporary', salaryFrom: 0, studentOnly: true, createdAt: '2026-10-20T00:00:00Z' }
  expect(parseSubscription(s)).toEqual(s)
  expect(() => parseSubscription({ ...s, salaryFrom: -1 })).toThrow()
  expect(() => parseSubscription({ ...s, studentOnly: 'true' })).toThrow()
})
