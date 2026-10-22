import { ApiError, requestJson } from '../../shared/api/client'
import { authUrl } from '../session/auth'
import { config } from '../../shared/config'

export interface Category {
  name: string
  emoji: string
  vacancies: number
}
export interface CategorySuggestion {
  resolved: {
    name: string
    match: 'exact' | 'synonym' | 'typo' | 'phrase' | 'other'
    detail: string | null
  }
  items: Category[]
}
export async function catalogRequest(path: string, signal?: AbortSignal): Promise<unknown> {
  const [pathname, query] = path.split('?')
  const url = authUrl(config.apiBaseUrl, `/api/${pathname}`, import.meta.env.PROD)
  return requestJson(query ? `${url}?${query}` : url, { signal })
}
export function parseCategories(body: unknown): Category[] {
  const items = (body as { items?: unknown })?.items
  if (!Array.isArray(items)) throw new ApiError('contract')
  return items.map((v) => {
    if (
      !v ||
      typeof v.name !== 'string' ||
      typeof v.emoji !== 'string' ||
      !Number.isSafeInteger(v.vacancies) ||
      v.vacancies < 0
    )
      throw new ApiError('contract')
    return { name: v.name, emoji: v.emoji, vacancies: v.vacancies }
  })
}
export async function loadCategories(preview: boolean, signal?: AbortSignal) {
  if (import.meta.env.DEV && preview) return (await import('../../mocks/catalogs')).categories
  return parseCategories(await catalogRequest('categories', signal))
}
export async function suggestCategories(
  q: string,
  preview: boolean,
  signal?: AbortSignal,
): Promise<CategorySuggestion> {
  if (import.meta.env.DEV && preview)
    return (await import('../../mocks/catalogs')).suggestCategory(q)
  const body = (await catalogRequest(
    `categories/suggest?${new URLSearchParams({ q, limit: '8' })}`,
    signal,
  )) as CategorySuggestion
  if (
    !body?.resolved ||
    typeof body.resolved.name !== 'string' ||
    !['exact', 'synonym', 'typo', 'phrase', 'other'].includes(body.resolved.match) ||
    (body.resolved.detail !== null && typeof body.resolved.detail !== 'string')
  )
    throw new ApiError('contract')
  return { resolved: body.resolved, items: parseCategories(body) }
}
export function categoryLabel(
  category: string,
  detail?: string | null,
  directory: Category[] = [],
) {
  const emoji =
    directory.find((c) => c.name === category)?.emoji ?? (category === 'Другое' ? '📌' : '')
  return [emoji, category === 'Другое' && detail ? `Другое · ${detail}` : category]
    .filter(Boolean)
    .join(' ')
}
