import { Building2, MapPin } from 'lucide-react'
import type { PublicVacancy } from './api'
import { EmployerBadge } from '../trust/EmployerTrust'
import { VacancyBadges } from '../badges/VacancyBadges'
import { Capacity } from '../capacity/Capacity'
import { formatSalary } from '../vacancies/model'

export function JobOverview({ job }: { job: PublicVacancy }) {
  return (
    <>
      <header className="job-detail-heading">
        <div className="job-employer">
          <span className="category-icon">
            <Building2 size={26} />
          </span>
          <div>
            <strong>{job.employer.displayName?.trim() || 'Работодатель'}</strong>
            <EmployerBadge confirmedHires={job.employer.confirmedHires} />
          </div>
        </div>
        <h1>{job.title}</h1>
        <strong className="vacancy-salary">{formatSalary(job.salaryMin, job.salaryMax)}</strong>
        <p className="salary-period">Период и условия оплаты уточняйте у работодателя.</p>
        <VacancyBadges job={job} detailed />
        <Capacity headcount={job.headcount} spotsLeft={job.spotsLeft} />
      </header>
      <section className="job-description-section">
        <h2>Где предстоит работать</h2>
        <p className="job-location">
          <MapPin size={18} />
          {job.regionCode || 'Регион не указан'}
        </p>
      </section>
      <section className="job-description-section">
        <h2>Условия и обязанности</h2>
        <div className="vacancy-description">
          {job.description || 'Работодатель пока не добавил описание.'}
        </div>
      </section>
    </>
  )
}
