import type { Application, ApplicationStatus } from '../../entities/hiring'
import { ApiError, authenticatedRequest } from '../../shared/api/client'
import { authUrl } from '../session/auth'

export interface ApplicationQuery {
  status?: ApplicationStatus
  limit: number
  offset: number
}
export interface ApplicationPage {
  items: Application[]
  total: number
  limit: number
  offset: number
}
export interface VacancyApplications {
  vacancy: Application['vacancy']
  items: Application[]
}
export interface StatusResult {
  application: Application
  notified: boolean
  unchanged: boolean
}
export interface ApplicationRepository {
  list(query: ApplicationQuery, signal?: AbortSignal): Promise<ApplicationPage>
  forVacancy(id: number, signal?: AbortSignal): Promise<VacancyApplications>
  updateStatus(id: number, status: ApplicationStatus): Promise<StatusResult>
}

export const statuses: ApplicationStatus[] = ['new', 'contacted', 'invited', 'hired', 'rejected']
export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && statuses.includes(value as ApplicationStatus)
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('contract')
  return value as Record<string, unknown>
}
function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new ApiError('contract')
  return value
}
function nullableString(value: unknown): string | null {
  if (value !== null && typeof value !== 'string') throw new ApiError('contract')
  return value
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new ApiError('contract')
  return value
}
export function parseVacancySummary(body: unknown): Application['vacancy'] {
  const value = record(body)
  if (
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    !['draft', 'published', 'closed'].includes(String(value.status))
  )
    throw new ApiError('contract')
  return {
    id: id(value.id),
    title: value.title,
    status: value.status as Application['vacancy']['status'],
  }
}
export function parseApplication(body: unknown, vacancy?: Application['vacancy']): Application {
  const value = record(body),
    candidate = record(value.candidate)
  if (!isApplicationStatus(value.status)) throw new ApiError('contract')
  const summary = vacancy ?? parseVacancySummary(value.vacancy)
  const vacancyId = id(value.vacancyId),
    candidateId = id(value.candidateUserId)
  if (summary.id !== vacancyId || id(candidate.id) !== candidateId) throw new ApiError('contract')
  return {
    id: id(value.id),
    vacancyId,
    candidateUserId: candidateId,
    status: value.status,
    contact: nullableString(value.contact),
    createdAt: date(value.createdAt),
    updatedAt: date(value.updatedAt),
    candidate: {
      id: candidateId,
      displayName: nullableString(candidate.displayName),
      phone: nullableString(candidate.phone),
    },
    vacancy: summary,
  }
}
export function parseApplicationPage(body: unknown): ApplicationPage {
  const value = record(body)
  if (
    !Array.isArray(value.items) ||
    typeof value.total !== 'number' ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    typeof value.offset !== 'number' ||
    !Number.isSafeInteger(value.offset) ||
    value.offset < 0 ||
    typeof value.limit !== 'number' ||
    !Number.isInteger(value.limit) ||
    value.limit < 1 ||
    value.limit > 200 ||
    value.items.length > value.limit
  )
    throw new ApiError('contract')
  return {
    items: value.items.map((item) => parseApplication(item)),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
  }
}

export function createApplicationRepository(
  base: string,
  token: string,
  onUnauthorized: () => void,
): ApplicationRepository {
  const root = authUrl(base, '/api', import.meta.env.PROD)
  const request = authenticatedRequest(token, onUnauthorized)
  return {
    async list(query, signal) {
      if (
        !Number.isSafeInteger(query.offset) ||
        query.offset < 0 ||
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 200 ||
        (query.status !== undefined && !isApplicationStatus(query.status))
      )
        throw new ApiError('contract')
      const params = new URLSearchParams({
        limit: String(query.limit),
        offset: String(query.offset),
      })
      if (query.status) params.set('status', query.status)
      const page = parseApplicationPage(await request(`${root}/applications?${params}`, { signal }))
      if (page.limit !== query.limit || page.offset !== query.offset) throw new ApiError('contract')
      return page
    },
    async forVacancy(vacancyId, signal) {
      const path = `${root}/vacancies/${id(vacancyId)}`
      // This endpoint omits vacancy details, so fetch its owned parent once per load.
      const [parent, body] = await Promise.all([
        request(path, { signal }),
        request(`${path}/applications`, { signal }),
      ])
      const vacancy = parseVacancySummary(parent)
      if (vacancy.id !== vacancyId || !Array.isArray(body)) throw new ApiError('contract')
      return { vacancy, items: body.map((item) => parseApplication(item, vacancy)) }
    },
    async updateStatus(applicationId, status) {
      if (!isApplicationStatus(status)) throw new ApiError('contract')
      const value = record(
        await request(`${root}/applications/${id(applicationId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }),
      )
      if (
        typeof value.notified !== 'boolean' ||
        (value.unchanged !== undefined && typeof value.unchanged !== 'boolean')
      )
        throw new ApiError('contract')
      const application = parseApplication(value)
      if (application.id !== applicationId) throw new ApiError('contract')
      return { application, notified: value.notified, unchanged: value.unchanged === true }
    },
  }
}
