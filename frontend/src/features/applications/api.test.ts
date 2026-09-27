import { describe, expect, it, vi } from 'vitest'
import { createApplicationRepository, parseApplication, parseApplicationPage } from './api'

const vacancy = { id: 7, title: 'Повар', status: 'published' }
const dto = {
  id: 3,
  vacancyId: 7,
  candidateUserId: 11,
  status: 'new',
  contact: null,
  createdAt: '2026-09-26T10:00:00.000Z',
  updatedAt: '2026-09-26T10:00:00.000Z',
  candidateChatId: 'private-chat',
  vacancy,
  candidate: {
    id: 11,
    displayName: null,
    phone: null,
    chatId: 'private-chat',
    maxUserId: 'private-max-id',
  },
}
const page = { items: [dto], total: 21, limit: 20, offset: 20 }
function setup(body: unknown, status = 200) {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetcher)
  const expired = vi.fn()
  return {
    api: createApplicationRepository('https://api.example.test', 'session-fixture', expired),
    fetcher,
    expired,
  }
}
describe('applications API contract', () => {
  it('keeps nullable contact and name, drops chat and MAX IDs', () => {
    const parsed = parseApplication(dto)
    expect(parsed).toMatchObject({
      id: 3,
      candidate: { id: 11, displayName: null, phone: null },
      contact: null,
    })
    expect(parsed).not.toHaveProperty('candidateChatId')
    expect(parsed.candidate).not.toHaveProperty('chatId')
    expect(parsed.candidate).not.toHaveProperty('maxUserId')
  })
  it.each([
    { ...dto, id: '3' },
    { ...dto, status: 'invalid' },
    { ...dto, updatedAt: 'invalid' },
    { ...dto, candidate: null },
    { ...dto, vacancyId: 8 },
  ])('rejects malformed or unrelated records', (value) => {
    expect(() => parseApplication(value)).toThrow('contract')
  })
  it('requests server pagination and status with Bearer authorization', async () => {
    const { api, fetcher } = setup(page)
    expect(await api.list({ status: 'new', limit: 20, offset: 20 })).toMatchObject({
      total: 21,
      offset: 20,
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/applications?limit=20&offset=20&status=new',
      expect.objectContaining({
        credentials: 'omit',
        headers: { Accept: 'application/json', Authorization: 'Bearer session-fixture' },
      }),
    )
  })
  it('assembles vacancy-scoped records from the two documented endpoints', async () => {
    const { api, fetcher } = setup(null)
    fetcher.mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('/applications') ? [{ ...dto, vacancy: undefined }] : vacancy,
          ),
        ),
    )
    expect(await api.forVacancy(7)).toMatchObject({ vacancy, items: [{ vacancy }] })
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'https://api.example.test/api/vacancies/7',
      'https://api.example.test/api/vacancies/7/applications',
    ])
  })
  it('preserves successful mutation and notification failure as separate results', async () => {
    const { api, fetcher } = setup({ ...dto, status: 'invited', notified: false, unchanged: false })
    expect(await api.updateStatus(3, 'invited')).toMatchObject({
      application: { status: 'invited' },
      notified: false,
      unchanged: false,
    })
    expect(fetcher.mock.calls[0]).toEqual([
      'https://api.example.test/api/applications/3',
      expect.objectContaining({ method: 'PATCH', body: '{"status":"invited"}' }),
    ])
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('handles idempotent status responses without inventing delivery', async () => {
    const { api } = setup({ ...dto, notified: false, unchanged: true })
    expect(await api.updateStatus(3, 'new')).toMatchObject({ unchanged: true, notified: false })
  })
  it('rejects missing notification flags and malformed pagination', async () => {
    const { api } = setup(dto)
    await expect(api.updateStatus(3, 'hired')).rejects.toMatchObject({ kind: 'contract' })
    expect(() => parseApplicationPage({ ...page, total: -1 })).toThrow('contract')
    expect(() => parseApplicationPage({ ...page, items: {} })).toThrow('contract')
  })
  it('expires the session on 401; resource denial leaves the session intact', async () => {
    const rejected = setup({ error: { code: 'unauthorized' } }, 401)
    await expect(rejected.api.list({ limit: 20, offset: 0 })).rejects.toMatchObject({
      kind: 'unauthorized',
    })
    expect(rejected.expired).toHaveBeenCalledOnce()
    const denied = setup({ error: { code: 'forbidden' } }, 403)
    await expect(denied.api.updateStatus(3, 'hired')).rejects.toMatchObject({ kind: 'forbidden' })
    expect(denied.expired).not.toHaveBeenCalled()
  })
  it('forwards cancellation and never retries failed status mutations', async () => {
    const { api, fetcher } = setup(null)
    const controller = new AbortController()
    controller.abort()
    fetcher.mockRejectedValue(new Error('network'))
    await expect(api.list({ limit: 20, offset: 0 }, controller.signal)).rejects.toBe(
      controller.signal.reason,
    )
    await expect(api.updateStatus(3, 'hired')).rejects.toMatchObject({ kind: 'network' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
