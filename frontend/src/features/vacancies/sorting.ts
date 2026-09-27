import type { Vacancy } from '../../entities/hiring'

export const vacancySortLabels = {
  newest: 'Сначала новые',
  oldest: 'Сначала старые',
  title: 'По названию',
} as const
export type VacancySort = keyof typeof vacancySortLabels

export function parseVacancySort(value: string | null): VacancySort {
  return value === 'oldest' || value === 'title' ? value : 'newest'
}

const titles = new Intl.Collator('ru', { sensitivity: 'base', numeric: true })
function newest(a: Vacancy, b: Vacancy) {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id
}

export function sortVacancies(rows: readonly Vacancy[], order: VacancySort): Vacancy[] {
  // Do not mutate the API snapshot. Use a deterministic tie-breaker across refreshes.
  return [...rows].sort((a, b) => {
    if (order === 'oldest') return -newest(a, b)
    if (order === 'title') return titles.compare(a.title.trim(), b.title.trim()) || newest(a, b)
    return newest(a, b)
  })
}
