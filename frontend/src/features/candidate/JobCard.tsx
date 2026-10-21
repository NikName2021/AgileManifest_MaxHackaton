import { Link } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowRight } from 'lucide-react'
import type { Job } from './api'
import { EmployerHeading } from './EmployerHeading'
import { VacancyBadges } from '../badges/VacancyBadges'
import { formatSalary } from '../vacancies/model'
import { RemainingPlaces } from '../capacity/Capacity'
import { JobPublicationDate } from './JobPublicationDate'

export function JobCard({ job, search }: { job: Job; search: string }) {
  return (
    <article className="job-list-item catalog-job linked-card">
      <Link className="card-main-link" to={`/jobs/${job.id}`} state={{ catalogSearch: search }}>
        <h2>{job.title}</h2>
      </Link>
      <EmployerHeading employer={job.employer} region={job.regionCode} />
      <strong className="vacancy-salary">{formatSalary(job.salaryMin, job.salaryMax)}</strong>
      <VacancyBadges job={job} />
      {job.myApplication && <span className="candidate-applied">Вы уже откликнулись</span>}
      <div className="job-card-footer">
        <JobPublicationDate value={job.createdAt} />
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
