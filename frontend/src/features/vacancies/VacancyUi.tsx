import { Button } from '@maxhub/max-ui'
import type { Vacancy, VacancyStatus } from '../../entities/hiring'
import { errorText, formatSalary, statusLabels } from './model'
import { displayedBadges } from '../badges/api'
import { scheduleLabels } from './model'
import { useSession } from '../session/context'
import { useResource } from '../../shared/api/useResource'
import { EmployerBadge } from '../trust/EmployerTrust'
import { Pill } from '../../shared/ui/Pill'
import { categoryLabel } from '../categories/api'
import { useRegionName } from '../../shared/api/useRegionName'

export function VacancyStatusBadge({ status }: { status: VacancyStatus }) {
  return <Pill tone={`vacancy-status ${status}`}>{statusLabels[status]}</Pill>
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
  const { candidate } = useSession()
  const regionName = useRegionName()
  const profile = useResource(candidate.profile, 'account:profile')
  const n = vacancy.headcount ?? 0
  const word = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'человека' : 'человек'
  const badges = displayedBadges(vacancy.badges, vacancy.studentFriendly)
  return (
    <article className="vacancy-preview max-card-preview" aria-label="Предпросмотр вакансии">
      <div>
        <h2>{vacancy.title}</h2>
        <EmployerBadge
          confirmedHires={
            profile.result.state === 'ready'
              ? profile.result.data.employerTrust?.confirmedHires
              : undefined
          }
        />
      </div>
      <div>
        <strong className="vacancy-salary">
          {formatSalary(vacancy.salaryMin, vacancy.salaryMax)}
        </strong>
        <p>
          {[vacancy.regionCode && regionName(vacancy.regionCode), scheduleLabels[vacancy.schedule]]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {n > 0 && (
          <p>
            Набор: {n} {word}
          </p>
        )}
      </div>
      {!!badges.length && <p>{badges.map((b) => `${b.emoji} ${b.label}`).join(' · ')}</p>}
      {vacancy.description && <div className="vacancy-description">{vacancy.description}</div>}
      {vacancy.applyUrl ? (
        <a className="text-link" href={vacancy.applyUrl} target="_blank" rel="noreferrer">
          Ссылка для отклика
        </a>
      ) : (
        <span className="field-hint">Ссылка для отклика появится после публикации</span>
      )}
      <small className="preview-category">
        Сфера: {categoryLabel(vacancy.category, vacancy.categoryDetail)}
      </small>
    </article>
  )
}
