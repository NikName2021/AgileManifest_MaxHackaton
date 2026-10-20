import type { ApplicationStatus, Vacancy } from '../../entities/hiring'
import { isApplicationStatus } from '../applications/api'
import { ApiError, authenticatedRequest } from '../../shared/api/client'
import { authUrl } from '../session/auth'
import { parseShift, type Shift } from '../shifts/model'

export interface ApplicationRef {
  id: number
  status: ApplicationStatus
  createdAt: string
  updatedAt: string
}
export interface PublicVacancy extends Pick<
  Vacancy,
  | 'id'
  | 'title'
  | 'regionCode'
  | 'category'
  | 'schedule'
  | 'salaryMin'
  | 'salaryMax'
  | 'description'
  | 'status'
> {
  employer: { displayName: string | null; confirmedHires?: number }
  headcount?: number | null
  spotsLeft?: number | null
}
export interface Job extends PublicVacancy {
  status: 'published'
  createdAt: string
  myApplication: ApplicationRef | null
  canApply: boolean
  applyUnavailableReason: 'already_applied' | 'own_vacancy' | null
}
export interface MyApplication extends ApplicationRef, Shift {
  contact: string | null
  vacancy: PublicVacancy & { contactInfo: string | null }
}
export interface Profile {
  employerTrust?: { confirmedHires: number }
  id: number
  displayName: string | null
  applicationContact: string | null
  hasBotChat: boolean
}
export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
export interface JobQuery {
  q?: string
  region_code?: string
  category?: string
  schedule?: Vacancy['schedule']
  salary_from?: number
  salary_to?: number
  sort: 'newest' | 'salary_desc'
  limit: number
  offset: number
}
export interface JobFilters {
  regions: { value: string; label: string }[]
  categories: { value: string; label: string }[]
}
export interface ApplyResult extends ApplicationRef {
  vacancyId: number
  contact: string | null
  notified: boolean
}
export interface CandidateRepository {
  jobs(query: JobQuery, signal?: AbortSignal): Promise<Page<Job>>
  filters(signal?: AbortSignal): Promise<JobFilters>
  job(id: number, signal?: AbortSignal): Promise<Job>
  apply(id: number, contact: string): Promise<ApplyResult>
  applications(
    query: { status?: ApplicationStatus; limit: number; offset: number },
    signal?: AbortSignal,
  ): Promise<Page<MyApplication>>
  profile(signal?: AbortSignal): Promise<Profile>
  saveContact(contact: string | null): Promise<Profile>
}

function fail(): never {
  throw new ApiError('contract')
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail()
  return v as Record<string, unknown>
}
function integer(v: unknown, min = 0): number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= min ? v : fail()
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : fail()
}
function nullable(v: unknown): string | null {
  return v === null ? null : str(v)
}
function bool(v: unknown): boolean {
  return typeof v === 'boolean' ? v : fail()
}
function date(v: unknown): string {
  const s = str(v)
  return Number.isFinite(Date.parse(s)) ? s : fail()
}
function ref(body: unknown): ApplicationRef {
  const v = record(body)
  if (!isApplicationStatus(v.status)) return fail()
  return {
    id: integer(v.id, 1),
    status: v.status,
    createdAt: date(v.createdAt),
    updatedAt: date(v.updatedAt),
  }
}
function vacancy(body: unknown): PublicVacancy {
  const v = record(body)
  if (
    !['seasonal', 'temporary', 'permanent'].includes(str(v.schedule)) ||
    !['draft', 'published', 'closed'].includes(str(v.status)) ||
    !str(v.title).trim()
  )
    return fail()
  const salaryMin = v.salaryMin === null ? null : integer(v.salaryMin)
  const salaryMax = v.salaryMax === null ? null : integer(v.salaryMax)
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) return fail()
  return {
    ...(v.headcount !== undefined
      ? { headcount: v.headcount === null ? null : integer(v.headcount, 1) }
      : {}),
    ...(v.spotsLeft !== undefined
      ? { spotsLeft: v.spotsLeft === null ? null : integer(v.spotsLeft) }
      : {}),
    id: integer(v.id, 1),
    title: str(v.title),
    regionCode: str(v.regionCode),
    category: str(v.category),
    schedule: v.schedule as Vacancy['schedule'],
    salaryMin,
    salaryMax,
    description: nullable(v.description),
    status: v.status as Vacancy['status'],
    employer: {
      displayName: nullable(record(v.employer).displayName),
      ...(record(v.employer).confirmedHires !== undefined
        ? { confirmedHires: integer(record(v.employer).confirmedHires) }
        : {}),
    },
  }
}
export function parseJob(body: unknown): Job {
  const v = record(body),
    base = vacancy(v)
  const reason = v.applyUnavailableReason
  const mine = v.myApplication === null ? null : ref(v.myApplication)
  const canApply = bool(v.canApply)
  if (
    base.status !== 'published' ||
    (reason !== null && reason !== 'already_applied' && reason !== 'own_vacancy') ||
    canApply !== (reason === null) ||
    (reason === 'already_applied' && !mine) ||
    (mine && canApply)
  )
    return fail()
  return {
    ...base,
    status: 'published',
    createdAt: date(v.createdAt),
    myApplication: mine,
    canApply,
    applyUnavailableReason: reason as Job['applyUnavailableReason'],
  }
}
export function parseProfile(body: unknown): Profile {
  const v = record(body)
  return {
    ...(v.employerTrust !== undefined
      ? { employerTrust: { confirmedHires: integer(record(v.employerTrust).confirmedHires) } }
      : {}),
    id: integer(v.id, 1),
    displayName: nullable(v.displayName),
    applicationContact: nullable(v.applicationContact),
    hasBotChat: bool(v.hasBotChat),
  }
}
export function parseMyApplication(body: unknown): MyApplication {
  const v = record(body),
    job = record(v.vacancy)
  return {
    ...ref(v),
    contact: nullable(v.contact),
    ...parseShift(v),
    vacancy: { ...vacancy(job), contactInfo: nullable(job.contactInfo) },
  }
}
function page<T>(
  body: unknown,
  parse: (v: unknown) => T,
  query: { limit: number; offset: number },
): Page<T> {
  const v = record(body)
  if (
    !Array.isArray(v.items) ||
    v.limit !== query.limit ||
    v.offset !== query.offset ||
    v.items.length > query.limit
  )
    return fail()
  return {
    items: v.items.map(parse),
    total: integer(v.total),
    limit: integer(v.limit, 1),
    offset: integer(v.offset),
  }
}
function queryString(query: object) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') q.set(k, String(v))
  return q.toString()
}
export function createCandidateRepository(
  base: string,
  token: string,
  onUnauthorized: () => void,
): CandidateRepository {
  const root = authUrl(base, '/api', import.meta.env.PROD)
  const send = authenticatedRequest(token, onUnauthorized)
  const request = (path: string, options?: RequestInit) => send(root + path, options)
  return {
    async jobs(query, signal) {
      return page(await request(`/jobs?${queryString(query)}`, { signal }), parseJob, query)
    },
    async filters(signal) {
      const v = record(await request('/jobs/filters', { signal }))
      function options(value: unknown) {
        if (!Array.isArray(value)) return fail()
        return value.map((item) => {
          const o = record(item)
          return { value: str(o.value), label: str(o.label) }
        })
      }
      return { regions: options(v.regions), categories: options(v.categories) }
    },
    async job(id, signal) {
      const result = parseJob(await request(`/jobs/${integer(id, 1)}`, { signal }))
      if (result.id !== id) return fail()
      return result
    },
    async apply(id, contact) {
      const v = record(
        await request('/applications', {
          method: 'POST',
          body: JSON.stringify({ vacancy_id: integer(id, 1), contact: contact.trim() }),
        }),
      )
      if (v.vacancyId !== id) return fail()
      return {
        ...ref(v),
        vacancyId: integer(v.vacancyId, 1),
        contact: nullable(v.contact),
        notified: bool(v.notified),
      }
    },
    async applications(query, signal) {
      return page(
        await request(`/me/applications?${queryString(query)}`, { signal }),
        parseMyApplication,
        query,
      )
    },
    async profile(signal) {
      return parseProfile(await request('/me', { signal }))
    },
    async saveContact(contact) {
      return parseProfile(
        await request('/me', {
          method: 'PATCH',
          body: JSON.stringify({ application_contact: contact?.trim() || null }),
        }),
      )
    },
  }
}
