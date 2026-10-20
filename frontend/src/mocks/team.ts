import type { ApplicationRepository } from '../features/applications/api'
import type { TeamInvite, TeamRepository } from '../features/team/api'

export function createPreviewTeam(applications: ApplicationRepository): TeamRepository {
  const marks = new Map<number, boolean>()
  const invitations = new Map<number, TeamInvite[]>()
  const list: TeamRepository['list'] = async () => {
    const page = await applications.list({ status: 'hired', offset: 0, limit: 200 })
    return page.items.map((a) => ({
      candidate: a.candidate,
      contact: a.contact,
      hiredCount: 1,
      lastHiredAt: a.updatedAt,
      lastVacancy: a.vacancy,
      reliable: marks.get(a.candidate.id) ?? false,
      hasBotChat: false,
    }))
  }
  return {
    list,
    async mark(id, reliable) {
      marks.set(id, reliable)
    },
    async invite(vacancyId, ids) {
      const members = (await list()).filter((m) => !ids || ids.includes(m.candidate.id))
      invitations.set(
        vacancyId,
        members.map((m, index) => ({
          id: index + 1,
          candidate: m.candidate,
          status: 'undelivered',
          createdAt: new Date().toISOString(),
          respondedAt: null,
        })),
      )
      return {
        sent: 0,
        results: members.map((m) => ({ candidateId: m.candidate.id, outcome: 'no_bot_chat' })),
      }
    },
    async invites(id) {
      return invitations.get(id) ?? []
    },
  }
}
