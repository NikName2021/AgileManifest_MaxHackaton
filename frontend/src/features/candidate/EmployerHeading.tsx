import { Building2 } from 'lucide-react'
import { EmployerBadge } from '../trust/EmployerTrust'
import type { PublicVacancy } from './api'

export function EmployerHeading({
  employer,
  region,
}: {
  employer: PublicVacancy['employer']
  region?: string
}) {
  return (
    <div className="job-employer">
      <div className="employer-name">
        <Building2 size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>{employer.displayName?.trim() || 'Работодатель'}</span>
      </div>
      <EmployerBadge confirmedHires={employer.confirmedHires} />
      {region !== undefined && <small>{region || 'Регион не указан'}</small>}
    </div>
  )
}
