import { ApiError, authenticatedRequest } from '../../shared/api/client'
import type { Region } from '../../shared/api/regions'
import { authUrl } from '../session/auth'
import type { Vacancy } from '../../entities/hiring'

export interface Subscription {
  id: number; region: Region | null; category: string | null; schedule: Vacancy['schedule'] | null
  salaryFrom: number | null; studentOnly: boolean; createdAt: string
}
export interface SubscriptionInput {
  region_code: string | null; category: string | null; schedule: Vacancy['schedule'] | null
  salary_from: number | null; student_only: boolean
}
export interface SubscriptionRepository {
  list(signal?: AbortSignal): Promise<{ items: Subscription[]; hasBotChat: boolean }>
  create(input: SubscriptionInput): Promise<Subscription>
  remove(id: number): Promise<void>
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ApiError('contract')
  return v as Record<string, unknown>
}
export function parseSubscription(body: unknown): Subscription {
  const v = object(body), r = v.region === null ? null : object(v.region)
  if (typeof v.id !== 'number' || !Number.isSafeInteger(v.id) || v.id < 1 ||
    (v.category !== null && typeof v.category !== 'string') ||
    (v.schedule !== null && !['seasonal', 'temporary', 'permanent'].includes(String(v.schedule))) ||
    (v.salaryFrom !== null && (typeof v.salaryFrom !== 'number' || !Number.isSafeInteger(v.salaryFrom) || v.salaryFrom < 0)) ||
    typeof v.studentOnly !== 'boolean' || typeof v.createdAt !== 'string' || !Number.isFinite(Date.parse(v.createdAt)) ||
    (r && (typeof r.code !== 'string' || typeof r.name !== 'string'))) throw new ApiError('contract')
  return { id: v.id, region: r ? { code: r.code as string, name: r.name as string } : null,
    category: v.category as string | null, schedule: v.schedule as Subscription['schedule'],
    salaryFrom: v.salaryFrom as number | null, studentOnly: v.studentOnly, createdAt: v.createdAt }
}
export function createSubscriptionRepository(base: string, token: string, expire: () => void): SubscriptionRepository {
  const root = authUrl(base, '/api/me/subscriptions', import.meta.env.PROD), send = authenticatedRequest(token, expire)
  return {
    async list(signal) {
      const v = object(await send(root, { signal }))
      if (!Array.isArray(v.items) || typeof v.hasBotChat !== 'boolean') throw new ApiError('contract')
      return { items: v.items.map(parseSubscription), hasBotChat: v.hasBotChat }
    },
    async create(input) { return parseSubscription(await send(root, { method: 'POST', body: JSON.stringify(input) })) },
    async remove(id) {
      if (!Number.isSafeInteger(id) || id < 1) throw new ApiError('contract')
      await send(`${root}/${id}`, { method: 'DELETE' })
    },
  }
}
