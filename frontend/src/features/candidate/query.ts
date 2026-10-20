import type { JobQuery } from './api'

export const pageSize = 20
export function offsetFrom(value: string | null) {
  const n = Number(value)
  return value && /^\d+$/.test(value) && Number.isSafeInteger(n) && n >= 0 ? n : 0
}
export function jobQuery(params: URLSearchParams): { query: JobQuery; error?: string } {
  let error: string | undefined
  function salary(key: string) {
    const raw = params.get(key)?.trim()
    if (!raw) return undefined
    if (!/^\d+$/.test(raw) || Number(raw) > 2147483647) {
      error = 'Зарплата должна быть целой суммой от 0 до 2 147 483 647 ₽.'
      return undefined
    }
    return Number(raw)
  }
  const from = salary('salary_from'),
    to = salary('salary_to')
  if (from !== undefined && to !== undefined && from > to)
    error = 'Зарплата «до» должна быть не меньше зарплаты «от».'
  const schedule = params.get('schedule') || undefined
  if (schedule && !['seasonal', 'temporary', 'permanent'].includes(schedule))
    error = 'Выберите тип занятости из списка.'
  const q = params.get('q')?.trim() || undefined,
    region = params.get('region_code') || undefined,
    category = params.get('category') || undefined
  if ((q?.length ?? 0) > 200 || (region?.length ?? 0) > 100 || (category?.length ?? 0) > 100)
    error = 'Слишком длинное значение поиска или фильтра.'
  return {
    error,
    query: {
      ...(params.get('student_friendly') === 'true' ? { student_friendly: true } : {}),
      q,
      region_code: region,
      category,
      schedule: schedule as JobQuery['schedule'],
      salary_from: from,
      salary_to: to,
      sort: params.get('sort') === 'salary_desc' ? 'salary_desc' : 'newest',
      limit: pageSize,
      offset: offsetFrom(params.get('offset')),
    },
  }
}
