import { Button } from '@maxhub/max-ui'
import { BriefcaseBusiness, Clock3, MapPin } from 'lucide-react'
import type { Vacancy, VacancyStatus } from '../../entities/hiring'
import { errorText, formatSalary, scheduleLabels, statusLabels } from './model'

export function VacancyStatusBadge({ status }: { status: VacancyStatus }) {
  return (
    <span className={`vacancy-status ${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  )
}
export function VacancyFailure({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="vacancy-notice is-error" role="alert">
      <p>{errorText(error)}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Обновить данные
        </Button>
      )}
    </div>
  )
}
export function VacancyLoading() {
  return (
    <div className="vacancy-loading" role="status">
      <span className="loading-dot" />
      Загружаем вакансии…
    </div>
  )
}
export function VacancyPreview({ vacancy }: { vacancy: Vacancy }) {
  return (
    <article className="vacancy-preview" aria-label="Предпросмотр вакансии">
      <div className="vacancy-preview-top">
        <span className="step-icon">
          <BriefcaseBusiness size={24} />
        </span>
        <span className="eyebrow">ВАША ВАКАНСИЯ</span>
      </div>
      <h2>{vacancy.title}</h2>
      <strong className="vacancy-salary">
        {formatSalary(vacancy.salaryMin, vacancy.salaryMax)}
      </strong>
      <div className="vacancy-meta">
        <span>
          <MapPin size={16} />
          {vacancy.regionCode || 'Регион не указан'}
        </span>
        <span>
          <Clock3 size={16} />
          {scheduleLabels[vacancy.schedule]}
        </span>
      </div>
      {vacancy.category && vacancy.category !== 'general' && (
        <p className="vacancy-category">{vacancy.category}</p>
      )}
      <div className="vacancy-description">
        {vacancy.description || 'Описание пока не добавлено.'}
      </div>
      {vacancy.contactInfo && (
        <div className="vacancy-contact">
          <small>КОНТАКТ ДЛЯ СВЯЗИ</small>
          <p>{vacancy.contactInfo}</p>
        </div>
      )}
    </article>
  )
}
