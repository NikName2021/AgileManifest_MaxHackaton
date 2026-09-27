import { describe, expect, it, vi } from 'vitest'
import { createPreviewSession } from '../../mocks/session'
import { loadHiringSummary, loadVacancyHiringSummary } from './loadSummary'

describe('hiring summary', () => {
  it('counts the complete vacancy list, isolates other vacancies and follows changed stages', async () => {
    const session = createPreviewSession()
    await session.loadApplicationExamples!()
    const list = vi.spyOn(session.applications, 'list')
    const forVacancy = vi.spyOn(session.applications, 'forVacancy')
    const signal = new AbortController().signal
    expect(await loadVacancyHiringSummary(session.applications, 1, signal)).toEqual({
      total: 23,
      stages: { new: 5, contacted: 5, invited: 5, hired: 4, rejected: 4 },
    })
    expect(forVacancy).toHaveBeenCalledExactlyOnceWith(1, signal)
    expect(list).not.toHaveBeenCalled()
    await session.applications.updateStatus(1, 'hired')
    expect(await loadVacancyHiringSummary(session.applications, 1, signal)).toEqual({
      total: 23,
      stages: { new: 4, contacted: 5, invited: 5, hired: 5, rejected: 4 },
    })
  })
  it('does not turn a failed or cancelled vacancy read into zero counts', async () => {
    const session = createPreviewSession()
    const forVacancy = vi
      .spyOn(session.applications, 'forVacancy')
      .mockRejectedValue(new Error('offline'))
    const controller = new AbortController()
    await expect(
      loadVacancyHiringSummary(session.applications, 1, controller.signal),
    ).rejects.toThrow('offline')
    forVacancy.mockResolvedValue({ vacancy: { id: 1, title: 'Повар', status: 'draft' }, items: [] })
    controller.abort()
    await expect(
      loadVacancyHiringSummary(session.applications, 1, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
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
