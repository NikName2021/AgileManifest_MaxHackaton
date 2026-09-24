// Domain names follow the supplied technical specification, not a verified API schema.
export type UserRole = 'employer' | 'candidate'
export type VacancyStatus = 'draft' | 'published' | 'closed'
export type ApplicationStatus = 'new' | 'contacted' | 'invited' | 'hired' | 'rejected'
export interface User {
  id: string
  max_user_id: string
  role: UserRole
  display_name: string
}
export interface Vacancy {
  id: string
  employer_user_id: string
  title: string
  region_code: string
  category: string
  schedule: string
  salary_min: number | null
  salary_max: number | null
  description: string
  status: VacancyStatus
  card_message_id: string | null
  created_at: string
}
export interface Application {
  id: string
  vacancy_id: string
  candidate_user_id: string
  status: ApplicationStatus
  contact: string
  created_at: string
  updated_at: string
}
export const applicationLabels: Record<ApplicationStatus, string> = {
  new: 'Новый',
  contacted: 'На связи',
  invited: 'Приглашён',
  hired: 'Нанят',
  rejected: 'Отказ',
}
