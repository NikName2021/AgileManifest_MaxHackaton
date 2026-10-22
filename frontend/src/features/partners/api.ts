import { parseBadges, type VacancyBadge } from '../badges/api'
import type { Vacancy } from '../../entities/hiring'
import { ApiError, authenticatedRequest } from '../../shared/api/client'
import { authUrl } from '../session/auth'
import type { Region } from '../../shared/api/regions'

export interface PartnerChannel {
  id: number
  title: string | null
  isChannel: boolean
  active: boolean
  region: Region | null
  studentOnly: boolean
  removed: boolean
  createdAt: string
  categories?: string[]
  schedule?: Vacancy['schedule'] | null
  salaryFrom?: number | null
  trustedOnly?: boolean
  badges?: VacancyBadge[]
  mode?: 'instant' | 'digest'
  digestHour?: number
  stats?: {
    vacanciesPosted: number
    applications: number
    hired: number
    lastPostedAt: string | null
  }
}
export interface ChannelInput {
  active?: boolean
  region_code?: string | null
  student_only?: boolean
  categories?: string[]
  schedule?: Vacancy['schedule'] | null
  salary_from?: number | null
  trusted_only?: boolean
  badges?: string[]
  mode?: 'instant' | 'digest'
  digest_hour?: number
}
export interface PartnerRepository {
  list(signal?: AbortSignal): Promise<PartnerChannel[]>
  update(id: number, input: ChannelInput): Promise<PartnerChannel>
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ApiError('contract')
  return v as Record<string, unknown>
}
export function parseChannel(body: unknown): PartnerChannel {
  const v = obj(body),
    r = v.region === null ? null : obj(v.region)
  if (
    typeof v.id !== 'number' ||
    !Number.isSafeInteger(v.id) ||
    v.id < 1 ||
    (v.title !== null && typeof v.title !== 'string') ||
    typeof v.isChannel !== 'boolean' ||
    typeof v.active !== 'boolean' ||
    typeof v.studentOnly !== 'boolean' ||
    typeof v.removed !== 'boolean' ||
    (r && (typeof r.code !== 'string' || typeof r.name !== 'string')) ||
    typeof v.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(v.createdAt))
  )
    throw new ApiError('contract')
  if (
    v.categories !== undefined &&
    (!Array.isArray(v.categories) || v.categories.some((c) => typeof c !== 'string'))
  )
    throw new ApiError('contract')
  if (v.schedule != null && !['seasonal', 'temporary', 'permanent'].includes(String(v.schedule)))
    throw new ApiError('contract')
  if (v.salaryFrom != null && (!Number.isSafeInteger(v.salaryFrom) || Number(v.salaryFrom) < 0))
    throw new ApiError('contract')
  if (v.trustedOnly !== undefined && typeof v.trustedOnly !== 'boolean')
    throw new ApiError('contract')
  if (v.mode !== undefined && !['instant', 'digest'].includes(String(v.mode)))
    throw new ApiError('contract')
  if (
    v.digestHour !== undefined &&
    (!Number.isInteger(v.digestHour) || Number(v.digestHour) < 0 || Number(v.digestHour) > 23)
  )
    throw new ApiError('contract')
  const stats = v.stats === undefined ? undefined : obj(v.stats)
  if (
    stats &&
    (['vacanciesPosted', 'applications', 'hired'].some(
      (k) => !Number.isSafeInteger(stats[k]) || Number(stats[k]) < 0,
    ) ||
      (stats.lastPostedAt !== null &&
        (typeof stats.lastPostedAt !== 'string' ||
          !Number.isFinite(Date.parse(stats.lastPostedAt)))))
  )
    throw new ApiError('contract')
  return {
    ...(v.categories !== undefined ? { categories: v.categories as string[] } : {}),
    ...(v.schedule !== undefined ? { schedule: v.schedule as PartnerChannel['schedule'] } : {}),
    ...(v.salaryFrom !== undefined ? { salaryFrom: v.salaryFrom as number | null } : {}),
    ...(v.trustedOnly !== undefined ? { trustedOnly: v.trustedOnly as boolean } : {}),
    ...(v.badges !== undefined ? { badges: parseBadges(v.badges) } : {}),
    ...(v.mode !== undefined ? { mode: v.mode as 'instant' | 'digest' } : {}),
    ...(v.digestHour !== undefined ? { digestHour: Number(v.digestHour) } : {}),
    ...(stats ? { stats: stats as unknown as PartnerChannel['stats'] } : {}),
    id: v.id,
    title: v.title as string | null,
    isChannel: v.isChannel,
    active: v.active,
    region: r ? { code: r.code as string, name: r.name as string } : null,
    studentOnly: v.studentOnly,
    removed: v.removed,
    createdAt: v.createdAt,
  }
}
export function createPartnerRepository(
  base: string,
  token: string,
  expire: () => void,
): PartnerRepository {
  const root = authUrl(base, '/api/partner-channels', import.meta.env.PROD),
    send = authenticatedRequest(token, expire)
  return {
    async list(signal) {
      const v = obj(await send(root, { signal }))
      if (!Array.isArray(v.items)) throw new ApiError('contract')
      return v.items.map(parseChannel)
    },
    async update(id, input) {
      if (!Number.isSafeInteger(id) || id < 1) throw new ApiError('contract')
      const channel = parseChannel(
        await send(`${root}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
      )
      if (channel.id !== id) throw new ApiError('contract')
      return channel
    },
  }
}
