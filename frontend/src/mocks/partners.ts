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
        active: input.active,
        studentOnly: input.student_only,
        region: (await getRegions(true)).find((r) => r.code === input.region_code) ?? null,
      }
      return { ...channel }
    },
  }
}
