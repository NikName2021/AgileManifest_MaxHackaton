import type { CandidateRepository, Job, MyApplication, Profile } from '../features/candidate/api'
import { ApiError } from '../shared/api/client'

// Synthetic development-only examples, never used as a fallback for a failed live API.
export function createPreviewCandidate(): CandidateRepository {
  let profile: Profile = {
    id: 1,
    displayName: 'Демо-кабинет',
    applicationContact: null,
    hasBotChat: false,
  }
  const jobs: Job[] = [
    {
      id: 1001,
      title: 'Помощник на сбор урожая',
      regionCode: 'Краснодар',
      category: 'Сельское хозяйство',
      schedule: 'seasonal',
      studentFriendly: true,
      salaryMin: 50000,
      salaryMax: 70000,
      description:
        'Демонстрационная вакансия. Сбор и сортировка урожая, работа в команде. Обучение на месте. Условия проживания и график обсуждаются с работодателем.',
      status: 'published',
      createdAt: '2026-10-19T08:00:00Z',
      employer: { displayName: 'Демо: фермерское хозяйство' },
      myApplication: null,
      canApply: true,
      applyUnavailableReason: null,
    },
    {
      id: 1002,
      title: 'Повар в загородный отель',
      regionCode: 'Тула',
      category: 'Общественное питание',
      schedule: 'temporary',
      salaryMin: 70000,
      salaryMax: 90000,
      description:
        'Демонстрационная вакансия. Приготовление завтраков и обедов. Нужен опыт работы на кухне. Питание на смене.',
      status: 'published',
      createdAt: '2026-10-18T08:00:00Z',
      employer: { displayName: 'Демо: загородный отель' },
      myApplication: null,
      canApply: true,
      applyUnavailableReason: null,
    },
    {
      id: 1003,
      title: 'Продавец в магазин',
      regionCode: 'Тула',
      category: 'Торговля',
      schedule: 'permanent',
      salaryMin: null,
      salaryMax: null,
      description:
        'Демонстрационная вакансия. Работа с покупателями и выкладка товара. Оплата по договорённости.',
      status: 'published',
      createdAt: '2026-10-17T08:00:00Z',
      employer: { displayName: 'Демо: магазин' },
      myApplication: null,
      canApply: true,
      applyUnavailableReason: null,
    },
  ]
  const applications: MyApplication[] = []
  const clone = <T>(value: T): T => structuredClone(value)
  function get(id: number) {
    const job = jobs.find((j) => j.id === id)
    if (!job) throw new ApiError('server', 404, 'not_found')
    return job
  }
  return {
    async jobs(query) {
      const rows = jobs.filter(
        (j) =>
          (!query.q ||
            `${j.title} ${j.description}`
              .toLocaleLowerCase('ru')
              .includes(query.q.toLocaleLowerCase('ru'))) &&
          (!query.region_code || j.regionCode === query.region_code) &&
          (!query.category || j.category === query.category) &&
          (!query.schedule || j.schedule === query.schedule) &&
          (!query.student_friendly || j.studentFriendly === true) &&
          (query.salary_from === undefined ||
            (j.salaryMax ?? j.salaryMin ?? -1) >= query.salary_from) &&
          (query.salary_to === undefined ||
            (j.salaryMin ?? j.salaryMax ?? Infinity) <= query.salary_to),
      )
      rows.sort((a, b) =>
        query.sort === 'salary_desc'
          ? (b.salaryMax ?? b.salaryMin ?? -1) - (a.salaryMax ?? a.salaryMin ?? -1) || b.id - a.id
          : Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id,
      )
      return clone({
        items: rows.slice(query.offset, query.offset + query.limit),
        total: rows.length,
        limit: query.limit,
        offset: query.offset,
      })
    },
    async filters() {
      const values = (key: 'regionCode' | 'category') =>
        [...new Set(jobs.map((j) => j[key]))].map((v) => ({ value: v, label: v }))
      return { regions: values('regionCode'), categories: values('category') }
    },
    async job(id) {
      return clone(get(id))
    },
    async profile() {
      return clone(profile)
    },
    async saveContact(contact) {
      profile = { ...profile, applicationContact: contact }
      return clone(profile)
    },
    async apply(id, contact) {
      const job = get(id)
      if (job.myApplication) throw new ApiError('server', 409, 'already_applied')
      if (!contact.trim()) throw new ApiError('server', 400, 'validation_error')
      const now = new Date().toISOString()
      const ref = {
        id: applications.length + 1,
        status: 'new' as const,
        createdAt: now,
        updatedAt: now,
      }
      job.myApplication = ref
      job.canApply = false
      job.applyUnavailableReason = 'already_applied'
      applications.unshift({
        ...ref,
        contact,
        vacancy: { ...job, contactInfo: 'Демонстрационный контакт работодателя' },
      })
      return { ...ref, vacancyId: id, contact, notified: false }
    },
    async applications(query) {
      const rows = applications.filter((a) => !query.status || a.status === query.status)
      return clone({
        items: rows.slice(query.offset, query.offset + query.limit),
        total: rows.length,
        limit: query.limit,
        offset: query.offset,
      })
    },
  }
}
