import { Link } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowRight, Building2 } from 'lucide-react'
import type { Job } from './api'
import { EmployerBadge } from '../trust/EmployerTrust'
import { VacancyBadges } from '../badges/VacancyBadges'
import { formatSalary } from '../vacancies/model'
import { RemainingPlaces } from '../capacity/Capacity'

export function JobCard({ job, search }: { job: Job; search: string }) {
  return (
    <article className="job-list-item catalog-job linked-card">
      <div className="job-employer">
        <span className="category-icon">
          <Building2 size={22} aria-hidden="true" />
        </span>
        <div>
          <strong>{job.employer.displayName?.trim() || 'Работодатель'}</strong>
          <EmployerBadge confirmedHires={job.employer.confirmedHires} />
          <small>{job.regionCode || 'Регион не указан'}</small>
        </div>
      </div>
      <Link className="card-main-link" to={`/jobs/${job.id}`} state={{ catalogSearch: search }}>
        <h2>{job.title}</h2>
      </Link>
      <strong className="vacancy-salary">{formatSalary(job.salaryMin, job.salaryMax)}</strong>
      <VacancyBadges job={job} />
      {job.myApplication && <span className="candidate-applied">Вы уже откликнулись</span>}
      <div className="job-card-footer">
        <small>Опубликована {new Date(job.createdAt).toLocaleDateString('ru-RU')}</small>
        <RemainingPlaces spotsLeft={job.spotsLeft} />
        <Button
          asChild
          className="desktop-job-details"
          variant="secondary"
          iconAfter={<ArrowRight size={16} />}
        >
          <Link to={`/jobs/${job.id}`} state={{ catalogSearch: search }}>
            Подробнее
          </Link>
        </Button>
      </div>
    </article>
  )
}
