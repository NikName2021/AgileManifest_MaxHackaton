import { describe, expect, it, vi } from 'vitest'
import { createCandidateRepository, parseJob, parseMyApplication, parseProfile } from './api'
import { createPreviewCandidate } from '../../mocks/candidate'
import { jobQuery } from './query'

const query = { sort: 'newest' as const, limit: 20, offset: 0 }
describe('candidate API contracts', () => {
  it('uses isolated candidate endpoints, bearer headers and encoded filters', async () => {
    const example = await createPreviewCandidate().jobs(query)
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(example)))
    vi.stubGlobal('fetch', fetcher)
    const api = createCandidateRepository('https://example.test', 'fixture', vi.fn())
    await api.jobs({ ...query, q: 'повар & кафе', salary_from: 0 })
    const [url, options] = fetcher.mock.calls[0]
    expect(new URL(url).pathname).toBe('/api/jobs')
    expect(new URL(url).searchParams.get('q')).toBe('повар & кафе')
    expect(new URL(url).searchParams.get('salary_from')).toBe('0')
    expect(options.headers.Authorization).toBe('Bearer fixture')
    expect(options.credentials).toBe('omit')
  })
  it('rejects mismatched pagination and a different vacancy ID', async () => {
    const mock = createPreviewCandidate(),
      rows = await mock.jobs(query)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ...rows, offset: 20 })))
        .mockResolvedValueOnce(new Response(JSON.stringify(rows.items[1]))),
    )
    const api = createCandidateRepository('', 'fixture', vi.fn())
    await expect(api.jobs(query)).rejects.toMatchObject({ kind: 'contract' })
    await expect(api.job(1001)).rejects.toMatchObject({ kind: 'contract' })
  })
  it('validates publication and apply eligibility without exposing internal data', async () => {
    const job = await createPreviewCandidate().job(1001)
    expect(parseJob({ ...job, employerChatId: 'private' })).not.toHaveProperty('employerChatId')
    expect(() => parseJob({ ...job, status: 'draft' })).toThrow()
    expect(() =>
      parseJob({ ...job, canApply: true, applyUnavailableReason: 'own_vacancy' }),
    ).toThrow()
    expect(() =>
      parseJob({ ...job, canApply: false, applyUnavailableReason: 'already_applied' }),
    ).toThrow()
    expect(() =>
      parseProfile({ id: 1, displayName: null, applicationContact: null, hasBotChat: 'true' }),
    ).toThrow()
  })
  it('submits the confirmed contact, keeps notification failure distinct from failure to apply', async () => {
    const result = await createPreviewCandidate().apply(1001, 'contact')
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 201 }))
    vi.stubGlobal('fetch', fetcher)
    const api = createCandidateRepository('', 'fixture', vi.fn())
    expect(await api.apply(1001, ' @candidate ')).toMatchObject({ notified: false, status: 'new' })
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      vacancy_id: 1001,
      contact: '@candidate',
    })
  })
  it('expires the session for candidate requests and preserves business error codes', async () => {
    const expire = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { code: 'already_applied' } }), { status: 409 }),
        )
        .mockResolvedValueOnce(new Response('{}', { status: 401 })),
    )
    const api = createCandidateRepository('', 'fixture', expire)
    await expect(api.apply(1001, 'contact')).rejects.toMatchObject({ code: 'already_applied' })
    expect(expire).not.toHaveBeenCalled()
    await expect(api.profile()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(expire).toHaveBeenCalledOnce()
  })
  it('reads closed vacancy history and clears profile contact with null', async () => {
    const mock = createPreviewCandidate()
    await mock.apply(1001, '@candidate')
    const row = (await mock.applications({ limit: 20, offset: 0 })).items[0]
    expect(
      parseMyApplication({ ...row, vacancy: { ...row.vacancy, status: 'closed' } }).vacancy.status,
    ).toBe('closed')
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(await mock.profile())))
    vi.stubGlobal('fetch', fetcher)
    await createCandidateRepository('', 'fixture', vi.fn()).saveContact(null)
    expect(new URL(fetcher.mock.calls[0][0]).pathname).toBe('/api/me')
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ application_contact: null })
  })
})
describe('catalog URL validation', () => {
  it.each([
    'salary_from=-1',
    'salary_from=abc',
    'salary_to=2147483648',
    'salary_from=200&salary_to=100',
    'schedule=unknown',
  ])('rejects %s before making a search request', (value) => {
    expect(jobQuery(new URLSearchParams(value)).error).toBeTruthy()
  })
  it('preserves zero and resets an invalid offset', () => {
    expect(jobQuery(new URLSearchParams('salary_from=0&offset=-1')).query).toMatchObject({
      salary_from: 0,
      offset: 0,
    })
  })
})
