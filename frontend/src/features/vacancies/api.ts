import type { Vacancy } from '../../entities/hiring'
import { ApiError, requestJson } from '../../shared/api/client'
import { authUrl } from '../session/auth'

export interface VacancyInput {
  title: string
  region_code: string
  category: string
  schedule: Vacancy['schedule']
  salary_min: number | null
  salary_max: number | null
  description: string | null
  contact_info: string | null
}

export interface VacancyRepository {
  list(signal?: AbortSignal): Promise<Vacancy[]>
  get(id: number, signal?: AbortSignal): Promise<Vacancy>
  create(input: VacancyInput): Promise<Vacancy>
  update(id: number, input: VacancyInput): Promise<Vacancy>
  publish(id: number): Promise<Vacancy>
  close(id: number): Promise<Vacancy>
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}
function salary(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}
export function parseVacancy(value: unknown): Vacancy {
  if (!value || typeof value !== 'object') throw new ApiError('contract')
  const v = value as Record<string, unknown>
  if (
    typeof v.id !== 'number' ||
    !Number.isSafeInteger(v.id) ||
    v.id <= 0 ||
    typeof v.title !== 'string' ||
    !v.title.trim() ||
    typeof v.regionCode !== 'string' ||
    typeof v.category !== 'string' ||
    !['seasonal', 'temporary', 'permanent'].includes(String(v.schedule)) ||
    !['draft', 'published', 'closed'].includes(String(v.status)) ||
    !salary(v.salaryMin) ||
    !salary(v.salaryMax) ||
    !nullableString(v.description) ||
    !nullableString(v.contactInfo) ||
    !nullableString(v.cardMessageId) ||
    typeof v.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(v.createdAt))
  )
    throw new ApiError('contract')
  return {
    id: v.id,
    title: v.title,
    regionCode: v.regionCode,
    category: v.category,
    schedule: v.schedule as Vacancy['schedule'],
    status: v.status as Vacancy['status'],
    salaryMin: v.salaryMin,
    salaryMax: v.salaryMax,
    description: v.description,
    contactInfo: v.contactInfo,
    cardMessageId: v.cardMessageId,
    createdAt: v.createdAt,
  }
}

export function createVacancyRepository(
  base: string,
  token: string,
  onUnauthorized: () => void,
): VacancyRepository {
  const endpoint = authUrl(base, '/api/vacancies', import.meta.env.PROD)
  async function request(path: string, options: RequestInit = {}) {
    try {
      return await requestJson(endpoint + path, {
        ...options,
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unauthorized') onUnauthorized()
      throw error
    }
  }
  function idPath(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError('contract')
    return `/${id}`
  }
  return {
    async list(signal) {
      const body = await request('', { signal })
      if (!Array.isArray(body)) throw new ApiError('contract')
      return body.map(parseVacancy)
    },
    async get(id, signal) {
      return parseVacancy(await request(idPath(id), { signal }))
    },
    async create(input) {
      return parseVacancy(await request('', { method: 'POST', body: JSON.stringify(input) }))
    },
    async update(id, input) {
      return parseVacancy(
        await request(idPath(id), { method: 'PATCH', body: JSON.stringify(input) }),
      )
    },
    async publish(id) {
      return parseVacancy(await request(`${idPath(id)}/publish`, { method: 'POST' }))
    },
    async close(id) {
      return parseVacancy(await request(`${idPath(id)}/close`, { method: 'POST' }))
    },
  }
}
