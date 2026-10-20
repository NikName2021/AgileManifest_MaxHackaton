import { ApiError } from '../shared/api/client'
import { getRegions } from '../shared/api/regions'
import type { Subscription, SubscriptionRepository } from '../features/subscriptions/api'

export function createPreviewSubscriptions(): SubscriptionRepository {
  const rows = new Map<number, Subscription>()
  let next = 1
  return {
    async list() { return { items: [...rows.values()], hasBotChat: false } },
    async create(input) {
      if (rows.size >= 5) throw new ApiError('server', 409, 'subscription_limit_reached')
      const regions = await getRegions(true)
      const row: Subscription = { id: next++, region: regions.find((r) => r.code === input.region_code) ?? null,
        category: input.category, schedule: input.schedule, salaryFrom: input.salary_from,
        studentOnly: input.student_only, createdAt: new Date().toISOString() }
      rows.set(row.id, row); return row
    },
    async remove(id) { rows.delete(id) },
  }
}
