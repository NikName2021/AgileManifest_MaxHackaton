import { ApiError, requestJson } from '../../shared/api/client'
import { authUrl } from '../session/auth'
import { config } from '../../shared/config'

export interface VacancyBadge {
  key: string
  emoji: string
  label: string
}
export interface BadgeGroup {
  key: string
  label: string
  emoji: string
  items: VacancyBadge[]
}
export interface BadgeCatalog {
  groups: BadgeGroup[]
  maxPerVacancy: number
}

export function parseBadges(value: unknown): VacancyBadge[] {
  if (!Array.isArray(value)) throw new ApiError('contract')
  const result = value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new ApiError('contract')
    const badge = item as Record<string, unknown>
    if (
      typeof badge.key !== 'string' ||
      !badge.key ||
      typeof badge.emoji !== 'string' ||
      typeof badge.label !== 'string' ||
      !badge.label
    )
      throw new ApiError('contract')
    return { key: badge.key, emoji: badge.emoji, label: badge.label }
  })
  if (new Set(result.map((b) => b.key)).size !== result.length) throw new ApiError('contract')
  return result
}

export function parseBadgeCatalog(value: unknown): BadgeCatalog {
  if (!value || typeof value !== 'object') throw new ApiError('contract')
  const data = value as Record<string, unknown>
  if (
    !Array.isArray(data.groups) ||
    !Number.isSafeInteger(data.maxPerVacancy) ||
    Number(data.maxPerVacancy) < 1
  )
    throw new ApiError('contract')
  return {
    maxPerVacancy: Number(data.maxPerVacancy),
    groups: data.groups.map((group: Record<string, unknown>) => {
      if (
        !group ||
        typeof group.key !== 'string' ||
        typeof group.label !== 'string' ||
        typeof group.emoji !== 'string'
      )
        throw new ApiError('contract')
      return {
        key: group.key,
        label: group.label,
        emoji: group.emoji,
        items: parseBadges(group.items),
      }
    }),
  }
}

export async function loadBadgeCatalog(signal?: AbortSignal): Promise<BadgeCatalog> {
  return parseBadgeCatalog(
    await requestJson(authUrl(config.apiBaseUrl, '/api/badges', import.meta.env.PROD), { signal }),
  )
}

export async function suggestBadges(
  q: string,
  exclude: string[],
  preview: boolean,
  signal?: AbortSignal,
): Promise<VacancyBadge[]> {
  if (import.meta.env.DEV && preview) {
    const { previewBadgeCatalog } = await import('../../mocks/badges')
    const clean = q.toLocaleLowerCase('ru').replaceAll('ё', 'е')
    return previewBadgeCatalog.groups
      .flatMap((g) => g.items)
      .filter(
        (b) =>
          !exclude.includes(b.key) &&
          b.label.toLocaleLowerCase('ru').replaceAll('ё', 'е').includes(clean),
      )
      .slice(0, 8)
  }
  const query = new URLSearchParams({ q, limit: '8', exclude: exclude.join(',') })
  const data = (await requestJson(
    `${authUrl(config.apiBaseUrl, '/api/badges/suggest', import.meta.env.PROD)}?${query}`,
    { signal },
  )) as { items: unknown }
  return parseBadges(data?.items)
}

export function displayedBadges(badges: VacancyBadge[] = [], studentFriendly = false) {
  return studentFriendly && !badges.some((b) => b.key === 'students_ok')
    ? [...badges, { key: 'students_ok', emoji: '🎓', label: 'Подходит студентам' }]
    : badges
}
