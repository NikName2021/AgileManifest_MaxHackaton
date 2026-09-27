import type { Vacancy, VacancyStatus } from '../../entities/hiring'
import type { VacancyInput } from './api'
import { ApiError } from '../../shared/api/client'

export const statusLabels: Record<VacancyStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликована',
  closed: 'Закрыта',
}
export const scheduleLabels: Record<Vacancy['schedule'], string> = {
  seasonal: 'Сезонная работа',
  temporary: 'Временная работа',
  permanent: 'Постоянная работа',
}
export const fieldLabels = {
  title: 'Название вакансии',
  region_code: 'Город или регион',
  category: 'Сфера деятельности',
  schedule: 'Тип занятости',
  salary_min: 'Зарплата от',
  salary_max: 'Зарплата до',
  description: 'Описание работы',
  contact_info: 'Контакт для связи',
}
export type VacancyForm = Omit<
  VacancyInput,
  'salary_min' | 'salary_max' | 'description' | 'contact_info'
> & {
  salary_min: string
  salary_max: string
  description: string
  contact_info: string
}
export type FieldErrors = Partial<Record<keyof VacancyForm, string>>
export function formValues(v?: Vacancy): VacancyForm {
  return {
    title: v?.title ?? '',
    region_code: v?.regionCode ?? '',
    category: v?.category ?? '',
    schedule: v?.schedule ?? 'seasonal',
    salary_min: v?.salaryMin?.toString() ?? '',
    salary_max: v?.salaryMax?.toString() ?? '',
    description: v?.description ?? '',
    contact_info: v?.contactInfo ?? '',
  }
}
export function validateForm(form: VacancyForm): { input: VacancyInput; errors: FieldErrors } {
  const errors: FieldErrors = {}
  for (const [key, limit] of Object.entries({
    title: 200,
    region_code: 100,
    category: 100,
    description: 4000,
    contact_info: 300,
  })) {
    const field = key as keyof VacancyForm
    if (form[field].trim().length > limit) errors[field] = `Не больше ${limit} символов.`
  }
  if (!form.title.trim()) errors.title = 'Укажите, кого вы ищете.'
  function amount(key: 'salary_min' | 'salary_max') {
    const value = form[key].replace(/\s/g, '')
    if (!value) return null
    const number = Number(value)
    // Prisma stores salaries as a PostgreSQL Int (32-bit), despite a looser REST validator.
    if (!/^\d+$/.test(value) || !Number.isInteger(number) || number > 2147483647) {
      errors[key] = 'Введите целую сумму от 0 до 2 147 483 647 ₽.'
      return null
    }
    return number
  }
  const min = amount('salary_min'),
    max = amount('salary_max')
  if (min !== null && max !== null && min > max)
    errors.salary_max = 'Верхняя граница должна быть не меньше нижней.'
  return {
    errors,
    input: {
      title: form.title.trim(),
      region_code: form.region_code.trim(),
      category: form.category.trim() || 'general',
      schedule: form.schedule,
      salary_min: min,
      salary_max: max,
      description: form.description.trim() || null,
      contact_info: form.contact_info.trim() || null,
    },
  }
}
const money = new Intl.NumberFormat('ru-RU')
export function formatSalary(min: number | null, max: number | null): string {
  if (min !== null && max !== null)
    return min === max ? `${money.format(min)} ₽` : `${money.format(min)}–${money.format(max)} ₽`
  if (min !== null) return `от ${money.format(min)} ₽`
  if (max !== null) return `до ${money.format(max)} ₽`
  return 'По договорённости'
}
// Mirrors the current server card composition to check MAX's 4000-character text limit.
// Keep this in sync with backend/src/vacancies/publish.ts; rendering below stays plain text.
export function cardTextLength(v: Vacancy): number {
  const escape = (text: string) => text.replace(/([\\`*_[\]()~>#+\-=|{}.!])/g, '\\$1')
  const salary =
    v.salaryMin && v.salaryMax
      ? `${v.salaryMin}–${v.salaryMax} ₽`
      : v.salaryMin
        ? `от ${v.salaryMin} ₽`
        : v.salaryMax
          ? `до ${v.salaryMax} ₽`
          : 'по договорённости'
  return [
    `**${escape(v.title)}**`,
    `Регион: ${escape(v.regionCode)}`,
    `График: ${escape(v.schedule)}`,
    `Зарплата: ${salary}`,
    v.description ? escape(v.description) : undefined,
    v.contactInfo ? `Контакт: ${escape(v.contactInfo)}` : undefined,
  ]
    .filter(Boolean)
    .join('\n').length
}
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Не удалось выполнить запрос. Попробуйте позже.'
  if (error.kind === 'unauthorized') return 'Сессия завершилась. Откройте приложение заново из MAX.'
  if (error.kind === 'forbidden')
    return 'Нет доступа к этой вакансии. Откройте список своих вакансий.'
  if (error.status === 404) return 'Вакансия не найдена. Возможно, она была удалена.'
  if (error.status === 409) return 'Статус вакансии уже изменился. Проверьте её текущее состояние.'
  if (error.code === 'validation_error')
    return 'Проверьте выделенные поля. Сервис не принял эти значения.'
  if (error.code === 'upstream_error')
    return 'Не удалось подтвердить отправку карточки в MAX. Убедитесь, что вы начали личный чат с ботом, и проверьте, не пришла ли карточка, прежде чем повторять публикацию.'
  if (error.kind === 'network') return 'Сервис не отвечает. Проверьте подключение к интернету.'
  if (error.kind === 'contract')
    return 'Сервис вернул неожиданный ответ. Обновите данные или попробуйте позже.'
  return 'Сервис временно недоступен. Попробуйте позже.'
}
