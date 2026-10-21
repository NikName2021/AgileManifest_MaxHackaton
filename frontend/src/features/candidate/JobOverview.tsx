import { MapPin } from 'lucide-react'
import type { PublicVacancy } from './api'
import { EmployerHeading } from './EmployerHeading'
import { VacancyBadges } from '../badges/VacancyBadges'
import { Capacity } from '../capacity/Capacity'
import { formatSalary } from '../vacancies/model'

export function JobOverview({ job }: { job: PublicVacancy }) {
  const hires = job.employer.confirmedHires
  const hireWord =
    hires === undefined
      ? ''
      : ({ one: 'найм', few: 'найма', many: 'наймов', other: 'наймов' } as Record<string, string>)[
          new Intl.PluralRules('ru-RU').select(hires)
        ]

  return (
    <>
      <header className="job-detail-heading">
        <h1>{job.title}</h1>
        <EmployerHeading employer={job.employer} />
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
      <section className="job-description-section employer-details" aria-label="Работодатель">
        <div className="employer-details-heading">
          <h2>Работодатель</h2>
          {hires !== undefined && (
            <span className="employer-hiring-badge" aria-label={`Подтверждённые наймы: ${hires}`}>
              {hires} {hireWord}
            </span>
          )}
        </div>
        <EmployerHeading employer={job.employer} />
      </section>
    </>
  )
}
