import { describe, expect, it, vi } from 'vitest'
import { createVacancyRepository, parseVacancy, type VacancyInput } from './api'

const dto = {
  id: 7,
  employerUserId: 42,
  title: 'Повар',
  regionCode: 'Тула',
  category: 'Общепит',
  schedule: 'seasonal',
  salaryMin: 50000,
  salaryMax: null,
  description: null,
  contactInfo: 'В чате',
  status: 'draft',
  cardMessageId: null,
  createdAt: '2026-09-26T10:00:00.000Z',
  employerChatId: 'private',
}
const input: VacancyInput = {
  title: 'Повар',
  region_code: 'Тула',
  category: 'Общепит',
  schedule: 'seasonal',
  salary_min: 50000,
  salary_max: null,
  description: null,
  contact_info: 'В чате',
}
function setup(body: unknown, status = 200) {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetcher)
  const expired = vi.fn()
  return {
    fetcher,
    expired,
    api: createVacancyRepository('https://api.example.test', 'session-fixture', expired),
  }
}
describe('vacancies backend contract', () => {
  it('parses camelCase, preserves nullable fields and drops server-only chat data', () => {
    expect(parseVacancy(dto)).toMatchObject({
      id: 7,
      salaryMin: 50000,
      salaryMax: null,
      contactInfo: 'В чате',
    })
    expect(parseVacancy(dto)).not.toHaveProperty('employerChatId')
  })
  it.each([
    { ...dto, id: '7' },
    { ...dto, status: 'unknown' },
    { ...dto, salaryMin: '50000' },
    { ...dto, createdAt: 'invalid' },
    { ...dto, contactInfo: undefined },
  ])('rejects malformed responses', (value) => {
    expect(() => parseVacancy(value)).toThrow('contract')
  })
  it('lists own vacancies with bearer auth and no caller-supplied employer ID', async () => {
    const { api, fetcher } = setup([dto])
    expect(await api.list()).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/vacancies',
      expect.objectContaining({
        credentials: 'omit',
        headers: expect.objectContaining({ Authorization: 'Bearer session-fixture' }),
      }),
    )
  })
  it('sends snake_case input and both salary boundaries on PATCH', async () => {
    const { api, fetcher } = setup(dto)
    await api.create(input)
    await api.update(7, { ...input, salary_min: null, salary_max: 60000 })
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(input) })
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
      salary_min: null,
      salary_max: 60000,
      contact_info: 'В чате',
    })
    expect(fetcher.mock.calls[1][0]).toBe('https://api.example.test/api/vacancies/7')
  })
  it('sends explicit publish/close requests without JSON body', async () => {
    const { api, fetcher } = setup(dto)
    await api.publish(7)
    await api.close(7)
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'https://api.example.test/api/vacancies/7/publish',
      'https://api.example.test/api/vacancies/7/close',
    ])
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('Content-Type')
    expect(fetcher.mock.calls[1][1].headers).not.toHaveProperty('Content-Type')
  })
  it('expires a rejected session but not a forbidden resource', async () => {
    const { api, expired } = setup(
      { error: { code: 'unauthorized', message: 'internal details' } },
      401,
    )
    await expect(api.list()).rejects.toMatchObject({
      kind: 'unauthorized',
      code: 'unauthorized',
      status: 401,
    })
    expect(expired).toHaveBeenCalledOnce()
    const forbidden = setup({ error: { code: 'forbidden' } }, 403)
    await expect(forbidden.api.get(7)).rejects.toMatchObject({ kind: 'forbidden' })
    expect(forbidden.expired).not.toHaveBeenCalled()
  })
  it('retains validation field names, hides server details and never retries mutations', async () => {
    const { api, fetcher } = setup(
      {
        error: {
          code: 'validation_error',
          message: 'private details',
          fields: { title: ['English error'] },
        },
      },
      400,
    )
    await expect(api.create(input)).rejects.toMatchObject({
      code: 'validation_error',
      fields: ['title'],
      message: 'server',
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('rejects malformed lists and invalid route IDs', async () => {
    const { api, fetcher } = setup({ items: [dto] })
    await expect(api.list()).rejects.toMatchObject({ kind: 'contract' })
    await expect(api.get(Number.NaN)).rejects.toMatchObject({ kind: 'contract' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
