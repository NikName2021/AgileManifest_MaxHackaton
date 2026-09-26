import type { Session } from '../features/session/context'
import type { Vacancy } from '../entities/hiring'
import type { VacancyInput } from '../features/vacancies/api'
import { ApiError } from '../shared/api/client'

// Development only: no API calls, persistence or outgoing messages.
export function createPreviewSession(): Session {
  const rows = new Map<number, Vacancy>()
  let nextId = 1
  function get(id: number): Vacancy {
    const row = rows.get(id)
    if (!row) throw new ApiError('server', 404, 'not_found')
    return { ...row }
  }
  function fields(input: VacancyInput) {
    return {
      title: input.title,
      regionCode: input.region_code,
      category: input.category,
      schedule: input.schedule,
      salaryMin: input.salary_min,
      salaryMax: input.salary_max,
      description: input.description,
      contactInfo: input.contact_info,
    }
  }
  function save(row: Vacancy) {
    rows.set(row.id, row)
    return { ...row }
  }
  return {
    mode: 'preview',
    user: { id: 1, display_name: 'Демо-кабинет' },
    vacancies: {
      async list() {
        return Array.from(rows.values(), (row) => ({ ...row }))
      },
      async get(id) {
        return get(id)
      },
      async create(input) {
        return save({
          ...fields(input),
          id: nextId++,
          status: 'draft',
          cardMessageId: null,
          createdAt: new Date().toISOString(),
        })
      },
      async update(id, input) {
        const row = get(id)
        if (row.status !== 'draft') throw new ApiError('server', 409, 'conflict')
        return save({ ...row, ...fields(input) })
      },
      async publish(id) {
        const row = get(id)
        if (row.status !== 'draft') throw new ApiError('server', 409, 'conflict')
        return save({ ...row, status: 'published', cardMessageId: `demo-${id}` })
      },
      async close(id) {
        return save({ ...get(id), status: 'closed' })
      },
    },
  }
}
