import { previewBadgeCatalog } from './badges'
import { getRegions } from '../shared/api/regions'
import type { PartnerChannel, PartnerRepository } from '../features/partners/api'
import { ApiError } from '../shared/api/client'

export function createPreviewPartners(): PartnerRepository {
  let channel: PartnerChannel = {
    id: 1,
    title: 'Студотряд · демо',
    isChannel: true,
    active: false,
    region: { code: '71', name: 'Тульская область' },
    studentOnly: true,
    categories: [],
    schedule: null,
    salaryFrom: null,
    trustedOnly: false,
    badges: [],
    mode: 'instant',
    digestHour: 10,
    stats: {
      vacanciesPosted: 12,
      applications: 7,
      hired: 2,
      lastPostedAt: new Date().toISOString(),
    },
    removed: false,
    createdAt: '2026-10-20T00:00:00Z',
  }
  return {
    async list() {
      return [{ ...channel }]
    },
    async update(id, input) {
      if (id !== channel.id) throw new ApiError('server', 404)
      channel = {
        ...channel,
        active: input.active ?? channel.active,
        studentOnly: input.student_only ?? channel.studentOnly,
        categories: input.categories ?? channel.categories,
        schedule: input.schedule === undefined ? channel.schedule : input.schedule,
        salaryFrom: input.salary_from === undefined ? channel.salaryFrom : input.salary_from,
        trustedOnly: input.trusted_only ?? channel.trustedOnly,
        mode: input.mode ?? channel.mode,
        digestHour: input.digest_hour ?? channel.digestHour,
        badges: input.badges
          ? previewBadgeCatalog.groups
              .flatMap((g) => g.items)
              .filter((b) => input.badges!.includes(b.key))
          : channel.badges,
        region:
          input.region_code === undefined
            ? channel.region
            : ((await getRegions(true)).find((r) => r.code === input.region_code) ?? null),
      }
      return { ...channel }
    },
  }
}
