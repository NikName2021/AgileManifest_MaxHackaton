import { BadgeCheck } from 'lucide-react'
import { useSession } from '../session/context'
import { useResource } from '../../shared/api/useResource'
import { useRefreshOnReturn } from '../../shared/api/useRefreshOnReturn'
import { Button } from '@maxhub/max-ui'
import { errorText } from '../vacancies/model'
import { hasEmployerBadge, successfulHireThreshold } from './model'
import './trust.css'

export function EmployerBadge({ confirmedHires }: { confirmedHires?: number }) {
  if (!hasEmployerBadge(confirmedHires)) return null
  return (
    <span
      className="employer-badge"
      title={`${confirmedHires} разных работников подтвердили выход и были наняты. Достаточно одной вакансии.`}
    >
      <BadgeCheck size={17} aria-hidden="true" />
      Надёжный работодатель
    </span>
  )
}
export function EmployerTrustProgress() {
  const { candidate } = useSession()
  const { result, refresh, reload } = useResource(candidate.profile, 'employer-trust')
  useRefreshOnReturn(refresh)
  return (
    <section className="settings-panel">
      <h2>Отметка работодателя</h2>
      {result.state === 'loading' && <p role="status">Загружаем сведения о наймах…</p>}
      {result.state === 'error' && (
        <div role="alert">
          <p>{errorText(result.error)}</p>
          <Button variant="secondary" onClick={reload}>
            Повторить
          </Button>
        </div>
      )}
      {result.state === 'ready' &&
        (result.data.employerTrust ? (
          <>
            <EmployerBadge confirmedHires={result.data.employerTrust.confirmedHires} />
            <p>Подтверждённых наймов: {result.data.employerTrust.confirmedHires}.</p>
            <progress
              className="trust-progress"
              max={successfulHireThreshold}
              value={Math.min(result.data.employerTrust.confirmedHires, successfulHireThreshold)}
              aria-label="Прогресс до отметки работодателя"
            />
            <p>
              Галочка появляется после пяти разных работников со статусом «Нанят», которые сами
              подтвердили выход на смену. Они могут быть наняты на одну вакансию.
            </p>
          </>
        ) : (
          <p>Сервис пока не передал число подтверждённых наймов.</p>
        ))}
    </section>
  )
}
