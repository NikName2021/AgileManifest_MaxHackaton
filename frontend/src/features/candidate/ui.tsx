import { Button, Spinner } from '@maxhub/max-ui'
import { ApiError } from '../../shared/api/client'
import { config } from '../../shared/config'
import { formatSalary } from '../vacancies/model'
import type { PublicVacancy } from './api'
import { EmployerBadge } from '../trust/EmployerTrust'
import { VacancyBadges } from '../badges/VacancyBadges'

function candidateError(error: unknown) {
  if (!(error instanceof ApiError)) return 'Не удалось загрузить данные. Попробуйте ещё раз.'
  if (error.kind === 'unauthorized') return 'Сессия завершилась. Откройте приложение заново из MAX.'
  if (error.code === 'already_applied')
    return 'Вы уже откликались на эту вакансию. Проверьте «Мои отклики».'
  if (error.code === 'self_application_forbidden')
    return 'На собственную вакансию откликнуться нельзя.'
  if (error.code === 'vacancy_unavailable' || error.status === 404)
    return 'Вакансия больше не доступна. Возможно, работодатель завершил поиск.'
  if (error.code === 'validation_error')
    return 'Проверьте заполненные поля. Сервис не принял эти значения.'
  if (error.kind === 'forbidden') return 'Нет доступа к этим данным.'
  if (error.kind === 'network') return 'Не удалось связаться с сервисом. Проверьте подключение.'
  if (error.kind === 'contract') return 'Не удалось подтвердить ответ сервиса. Обновите данные.'
  return 'Сервис временно недоступен. Попробуйте позже.'
}
export function CandidateError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="vacancy-notice is-error" role="alert">
      <p>{candidateError(error)}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Повторить
        </Button>
      )}
    </div>
  )
}
export function Loading({ label = 'Загружаем данные…' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="candidate-loading">
      <Spinner size={36} appearance="themed" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
export function Pagination({
  total,
  offset,
  limit,
  busy = false,
  onPage,
}: {
  total: number
  offset: number
  limit: number
  busy?: boolean
  onPage: (offset: number) => void
}) {
  if (total <= limit && offset === 0) return null
  return (
    <nav className="candidate-pagination" aria-label="Страницы результатов">
      <Button
        variant="secondary"
        disabled={busy || offset === 0}
        onClick={() => onPage(Math.max(0, offset - limit))}
      >
        Назад
      </Button>
      <span>
        {total === 0
          ? 'Нет результатов'
          : offset >= total
            ? 'Страница пуста'
            : `${offset + 1}–${Math.min(offset + limit, total)} из ${total}`}
      </span>
      <Button
        variant="secondary"
        disabled={busy || offset + limit >= total}
        onClick={() => onPage(offset + limit)}
      >
        Далее
      </Button>
    </nav>
  )
}
export function BotChatNote() {
  return (
    <div className="vacancy-notice">
      <p>
        Чтобы получать сообщения о статусе отклика, откройте личный чат с ботом и нажмите «Начать»,
        если эта кнопка доступна. Статус также можно посмотреть в «Моих откликах».
      </p>
      {config.botUrl && (
        <a className="text-link" href={config.botUrl} target="_blank" rel="noopener noreferrer">
          Открыть бота в MAX
        </a>
      )}
    </div>
  )
}
export function JobFacts({ job }: { job: PublicVacancy }) {
  return (
    <>
      <strong className="vacancy-salary">{formatSalary(job.salaryMin, job.salaryMax)}</strong>
      <div className="vacancy-meta">
        <span>{job.regionCode || 'Регион не указан'}</span>
      </div>
      <p>Работодатель: {job.employer.displayName?.trim() || 'Имя не указано'}</p>
      <EmployerBadge confirmedHires={job.employer.confirmedHires} />
      <VacancyBadges job={job} />
    </>
  )
}
