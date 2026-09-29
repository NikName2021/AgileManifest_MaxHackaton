import type { ApplicationStatus } from '../../entities/hiring'
import { statuses, type ApplicationRepository } from '../applications/api'

export interface HiringSummary {
  total: number | null
  stages: Record<ApplicationStatus, number | null>
}

export async function loadVacancyHiringSummary(
  applications: ApplicationRepository,
  vacancyId: number,
  signal: AbortSignal,
): Promise<HiringSummary> {
  // The vacancy endpoint returns the complete list, unlike the paginated employer endpoint.
  const { items } = await applications.forVacancy(vacancyId, signal)
  signal.throwIfAborted()
  const stages = { new: 0, contacted: 0, invited: 0, hired: 0, rejected: 0 }
  for (const item of items) stages[item.status] += 1
  return { total: items.length, stages }
}

export async function loadHiringSummary(
  applications: ApplicationRepository,
  signal: AbortSignal,
): Promise<HiringSummary> {
  // Only totals are needed: do not download or count paginated candidate lists.
  const queries = [undefined, ...statuses]
  const results = await Promise.allSettled(
    queries.map((status) => applications.list({ limit: 1, offset: 0, status }, signal)),
  )
  signal.throwIfAborted()
  if (results.every((result) => result.status === 'rejected'))
    throw new Error('Hiring summary unavailable')
  const totals = results.map((result) =>
    result.status === 'fulfilled' ? result.value.total : null,
  )
  const stages: HiringSummary['stages'] = {
    new: null,
    contacted: null,
    invited: null,
    hired: null,
    rejected: null,
  }
  statuses.forEach((status, index) => {
    stages[status] = totals[index + 1]
  })
  // Separate requests are not an atomic snapshot. Do not infer total or conversion from their sum.
  return { total: totals[0], stages }
}
