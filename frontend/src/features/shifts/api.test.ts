import { afterEach, expect, it, vi } from 'vitest'
import { createApplicationRepository } from '../applications/api'

afterEach(() => vi.unstubAllGlobals())
it('sends the shift contract and preserves failed notification delivery', async () => {
  const startAt = '2030-06-01T06:00:00.000Z'
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 7,
        startAt,
        shiftNote: 'У проходной',
        attendance: 'pending',
        notified: false,
      }),
    ),
  )
  vi.stubGlobal('fetch', fetch)
  const result = await createApplicationRepository('https://example.com', 'session', vi.fn())
    .setShift!(7, startAt, 'У проходной')
  expect(result).toMatchObject({ startAt, attendance: 'pending', notified: false })
  expect(fetch.mock.calls[0][0]).toBe('https://example.com/api/applications/7/shift')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    start_at: startAt,
    note: 'У проходной',
  })
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer session')
})
