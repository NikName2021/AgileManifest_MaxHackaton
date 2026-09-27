import { describe, expect, it, vi } from 'vitest'
import { createPreviewSession } from '../../mocks/session'
import { loadHiringSummary } from './loadSummary'

describe('hiring summary', () => {
  it('uses server totals for every stage with bounded requests, without fetching all pages', async () => {
    const session = createPreviewSession()
    const totals = { new: 120, contacted: 90, invited: 40, hired: 30, rejected: 25 }
    const list = vi.spyOn(session.applications, 'list').mockImplementation(async (query) => ({
      items: [],
      total: query.status ? totals[query.status] : 310,
      limit: query.limit,
      offset: query.offset,
    }))
    const signal = new AbortController().signal
    expect(await loadHiringSummary(session.applications, signal)).toEqual({
      total: 310,
      stages: totals,
    })
    expect(list).toHaveBeenCalledTimes(6)
    for (const [query, requestSignal] of list.mock.calls) {
      expect(query).toMatchObject({ limit: 1, offset: 0 })
      expect(requestSignal).toBe(signal)
    }
  })
  it('keeps successful stages when one request fails and does not derive a missing total', async () => {
    const session = createPreviewSession()
    vi.spyOn(session.applications, 'list').mockImplementation(async (query) => {
      if (!query.status || query.status === 'invited') throw new Error('offline')
      return { items: [], total: 0, limit: 1, offset: 0 }
    })
    expect(await loadHiringSummary(session.applications, new AbortController().signal)).toEqual({
      total: null,
      stages: { new: 0, contacted: 0, invited: null, hired: 0, rejected: 0 },
    })
  })
  it('rejects total failure instead of turning it into an empty funnel', async () => {
    const session = createPreviewSession()
    vi.spyOn(session.applications, 'list').mockRejectedValue(new Error('private server details'))
    await expect(
      loadHiringSummary(session.applications, new AbortController().signal),
    ).rejects.toThrow('Hiring summary unavailable')
  })
  it('discards an aborted load even if a repository resolves after cancellation', async () => {
    const session = createPreviewSession()
    const controller = new AbortController()
    const result = loadHiringSummary(session.applications, controller.signal)
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
})
