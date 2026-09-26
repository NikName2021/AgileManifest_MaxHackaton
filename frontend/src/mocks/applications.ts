import type { Application } from '../entities/hiring'
import type { ApplicationRepository } from '../features/applications/api'
import { statuses } from '../features/applications/api'
import type { VacancyRepository } from '../features/vacancies/api'
import { ApiError } from '../shared/api/client'

// Used only by the in-memory preview session; never calls a real API or sends messages.
export function createPreviewApplications(vacancies: VacancyRepository) {
  const rows = new Map<number, Application>()
  let seeded = false
  async function current(row: Application): Promise<Application> {
    const vacancy = await vacancies.get(row.vacancyId)
    return {
      ...row,
      candidate: { ...row.candidate },
      vacancy: { id: vacancy.id, title: vacancy.title, status: vacancy.status },
    }
  }
  const applications: ApplicationRepository = {
    async list(query) {
      const matching = Array.from(rows.values()).filter(
        (row) => !query.status || row.status === query.status,
      )
      return {
        items: await Promise.all(
          matching.slice(query.offset, query.offset + query.limit).map(current),
        ),
        total: matching.length,
        limit: query.limit,
        offset: query.offset,
      }
    },
    async forVacancy(id) {
      const vacancy = await vacancies.get(id)
      return {
        vacancy: { id: vacancy.id, title: vacancy.title, status: vacancy.status },
        items: await Promise.all(
          Array.from(rows.values())
            .filter((row) => row.vacancyId === id)
            .map(current),
        ),
      }
    },
    async updateStatus(id, status) {
      const row = rows.get(id)
      if (!row) throw new ApiError('server', 404, 'not_found')
      const unchanged = row.status === status
      const updated = {
        ...row,
        status,
        updatedAt: unchanged ? row.updatedAt : new Date().toISOString(),
      }
      rows.set(id, updated)
      return { application: await current(updated), notified: false, unchanged }
    },
  }
  async function loadApplicationExamples() {
    if (seeded) return
    seeded = true
    const titles = ['Бариста в летнее кафе · демо', 'Помощник в питомник · демо']
    for (let group = 0; group < titles.length; group++) {
      const draft = await vacancies.create({
        title: titles[group],
        region_code: 'Тула',
        category: 'Демо',
        schedule: 'seasonal',
        salary_min: 50000,
        salary_max: null,
        description: 'Демонстрационная вакансия для проверки откликов.',
        contact_info: null,
      })
      const vacancy = await vacancies.publish(draft.id)
      for (let i = 0; i < 23; i++) {
        const id = group * 23 + i + 1
        const date = new Date(Date.UTC(2026, 8, 26, 12, 0) - id * 3600000).toISOString()
        rows.set(id, {
          id,
          vacancyId: vacancy.id,
          candidateUserId: 1000 + id,
          status: statuses[i % statuses.length],
          contact:
            i % 6 === 0 ? null : `Демонстрационный контакт ${id} — пример для проверки интерфейса`,
          createdAt: date,
          updatedAt: date,
          candidate: {
            id: 1000 + id,
            displayName: `${['Анна', 'Михаил', 'Елена', 'Дмитрий', 'Мария', 'Иван'][i % 6]} · демо ${id}`,
            phone: null,
          },
          vacancy: { id: vacancy.id, title: vacancy.title, status: vacancy.status },
        })
      }
    }
  }
  return { applications, loadApplicationExamples }
}
