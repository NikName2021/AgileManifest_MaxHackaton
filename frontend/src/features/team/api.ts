import { ApiError, authenticatedRequest } from '../../shared/api/client'
import { authUrl } from '../session/auth'

export interface TeamMember {
  candidate: { id: number; displayName: string | null }
  contact: string | null
  hiredCount: number
  lastHiredAt: string | null
  lastVacancy: { id: number; title: string }
  reliable: boolean
  hasBotChat: boolean
}
export const outcomes = {
  sent: 'Приглашение отправлено',
  already_invited: 'Уже приглашён',
  already_applied: 'Уже откликнулся',
  no_bot_chat: 'Нет чата с ботом',
  not_in_team: 'Больше не входит в команду',
  delivery_failed: 'Не удалось доставить',
  limit_exceeded: 'Лимит 100 приглашений за запрос',
}
export const inviteStatuses = {
  sent: 'Ждём ответа',
  accepted: 'Готов выйти',
  declined: 'Не в этот раз',
  expired: 'Вакансия закрыта',
  undelivered: 'Не доставлено',
}
export interface TeamInvite {
  id: number
  candidate: TeamMember['candidate']
  status: keyof typeof inviteStatuses
  createdAt: string
  respondedAt: string | null
}
export interface InviteResult {
  sent: number
  results: { candidateId: number; outcome: keyof typeof outcomes }[]
}
export interface TeamRepository {
  list(signal?: AbortSignal): Promise<TeamMember[]>
  mark(id: number, reliable: boolean): Promise<void>
  invite(vacancyId: number, ids?: number[]): Promise<InviteResult>
  invites(vacancyId: number, signal?: AbortSignal): Promise<TeamInvite[]>
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ApiError('contract')
  return v as Record<string, unknown>
}
function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) throw new ApiError('contract')
  return v
}
function nullable(v: unknown): string | null {
  if (v !== null && typeof v !== 'string') throw new ApiError('contract')
  return v
}
function candidate(v: unknown) {
  const c = obj(v)
  return { id: num(c.id), displayName: nullable(c.displayName) }
}
export function parseTeam(body: unknown): TeamMember[] {
  const v = obj(body)
  if (!Array.isArray(v.items) || v.total !== v.items.length) throw new ApiError('contract')
  return v.items.map((item) => {
    const m = obj(item),
      last = obj(m.lastVacancy)
    if (
      typeof m.reliable !== 'boolean' ||
      typeof m.hasBotChat !== 'boolean' ||
      typeof last.title !== 'string'
    )
      throw new ApiError('contract')
    const date = nullable(m.lastHiredAt)
    if (date !== null && !Number.isFinite(Date.parse(date))) throw new ApiError('contract')
    return {
      candidate: candidate(m.candidate),
      contact: nullable(m.contact),
      hiredCount: num(m.hiredCount),
      lastHiredAt: date,
      lastVacancy: { id: num(last.id), title: last.title },
      reliable: m.reliable,
      hasBotChat: m.hasBotChat,
    }
  })
}
export function parseInviteResult(body: unknown): InviteResult {
  const v = obj(body)
  if (!Array.isArray(v.results)) throw new ApiError('contract')
  const results = v.results.map((item) => {
    const r = obj(item)
    if (typeof r.outcome !== 'string' || !Object.hasOwn(outcomes, r.outcome))
      throw new ApiError('contract')
    return { candidateId: num(r.candidateId), outcome: r.outcome as keyof typeof outcomes }
  })
  if (v.sent !== results.filter((r) => r.outcome === 'sent').length) throw new ApiError('contract')
  return { sent: v.sent as number, results }
}
export function createTeamRepository(
  base: string,
  token: string,
  expire: () => void,
): TeamRepository {
  const root = authUrl(base, '/api', import.meta.env.PROD),
    send = authenticatedRequest(token, expire)
  return {
    async list(signal) {
      return parseTeam(await send(`${root}/team`, { signal }))
    },
    async mark(id, reliable) {
      const v = obj(
        await send(`${root}/team/${num(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ reliable }),
        }),
      )
      if (v.candidateId !== id || v.reliable !== reliable) throw new ApiError('contract')
    },
    async invite(id, ids) {
      return parseInviteResult(
        await send(`${root}/vacancies/${num(id)}/team-invites`, {
          method: 'POST',
          body: JSON.stringify(ids ? { candidate_ids: ids.map(num) } : {}),
        }),
      )
    },
    async invites(id, signal) {
      const v = obj(await send(`${root}/vacancies/${num(id)}/team-invites`, { signal }))
      if (!Array.isArray(v.items)) throw new ApiError('contract')
      return v.items.map((item) => {
        const r = obj(item)
        if (
          typeof r.status !== 'string' ||
          !Object.hasOwn(inviteStatuses, r.status) ||
          typeof r.createdAt !== 'string' ||
          !Number.isFinite(Date.parse(r.createdAt))
        )
          throw new ApiError('contract')
        return {
          id: num(r.id),
          candidate: candidate(r.candidate),
          status: r.status as TeamInvite['status'],
          createdAt: r.createdAt,
          respondedAt: nullable(r.respondedAt),
        }
      })
    },
  }
}
