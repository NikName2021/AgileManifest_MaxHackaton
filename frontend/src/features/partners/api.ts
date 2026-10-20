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
}
export interface ChannelInput {
  active: boolean
  region_code: string | null
  student_only: boolean
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
  return {
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
