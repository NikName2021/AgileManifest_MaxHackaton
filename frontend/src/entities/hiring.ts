// The backend identifies users by numeric IDs and authorizes resources by ownership.
export type VacancyStatus = 'draft' | 'published' | 'closed'
export type ApplicationStatus = 'new' | 'contacted' | 'invited' | 'hired' | 'rejected'
export interface User {
  id: number
  display_name: string
}
export interface Vacancy {
  id: number
  title: string
  regionCode: string
  category: string
  schedule: 'seasonal' | 'temporary' | 'permanent'
  salaryMin: number | null
  salaryMax: number | null
  description: string | null
  contactInfo: string | null
  status: VacancyStatus
  cardMessageId: string | null
  createdAt: string
}
export interface Application {
  id: number
  vacancyId: number
  candidateUserId: number
  status: ApplicationStatus
  contact: string | null
  createdAt: string
  updatedAt: string
  candidate: { id: number; displayName: string | null; phone: string | null }
  vacancy: Pick<Vacancy, 'id' | 'title' | 'status'>
}
export const applicationLabels: Record<ApplicationStatus, string> = {
  new: 'Новый',
  contacted: 'На связи',
  invited: 'Приглашён',
  hired: 'Нанят',
  rejected: 'Отказ',
}
