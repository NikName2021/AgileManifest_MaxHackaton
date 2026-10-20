import { Input } from '../shared/ui/Input'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { ApiError } from '../shared/api/client'
import { RefreshStatus } from '../shared/ui/RefreshStatus'
import { BotChatNote, CandidateError, JobFacts, Loading } from '../features/candidate/ui'
import type { Job, Profile } from '../features/candidate/api'

function ApplyForm({
  job,
  profile,
  onSaved,
  onBusy,
  expanded,
  onExpand,
}: {
  job: Job
  profile?: Profile
  onSaved: (job: Job) => void
  onBusy: (busy: boolean) => void
  expanded: boolean
  onExpand: () => void
}) {
  const { candidate, mode } = useSession()
  const [contact, setContact] = useState(profile?.applicationContact ?? '')
  const [busy, setBusy] = useState(false),
    lock = useRef(false)
  const [error, setError] = useState<unknown>(),
    [invalid, setInvalid] = useState('')
  const [notice, setNotice] = useState(''),
    [uncertain, setUncertain] = useState(false)
  async function perform(check = false) {
    if (lock.current || (!check && (uncertain || !job.canApply))) return
    if (!check && (!contact.trim() || contact.trim().length > 200)) {
      setInvalid('Укажите контакт для связи: от 1 до 200 символов.')
      return
    }
    lock.current = true
    setBusy(true)
    onBusy(true)
    setError(undefined)
    setInvalid('')
    try {
      if (check) {
        const latest = await candidate.job(job.id)
        onSaved(latest)
        setUncertain(false)
        setNotice(
          latest.myApplication
            ? 'Отклик уже сохранён. Он доступен в «Моих откликах».'
            : 'Сохранённый отклик пока не найден. Можно повторить отправку — второй отклик не создастся.',
        )
      } else {
        const result = await candidate.apply(job.id, contact)
        onSaved({
          ...job,
          canApply: false,
          applyUnavailableReason: 'already_applied',
          myApplication: result,
        })
        setNotice(
          mode === 'preview'
            ? 'Демо-отклик сохранён. Сообщения в MAX не отправляются.'
            : result.notified
              ? 'Отклик отправлен. Работодатель получил уведомление.'
              : 'Отклик сохранён и доступен работодателю. Уведомление в MAX отправить не удалось.',
        )
      }
    } catch (e) {
      setError(e)
      if (e instanceof ApiError && e.code === 'already_applied') {
        setUncertain(true)
      } else if (
        !(e instanceof ApiError) ||
        e.kind === 'network' ||
        e.kind === 'contract' ||
        e.status >= 500
      ) {
        setUncertain(true)
      } else if (
        e instanceof ApiError &&
        (e.code === 'vacancy_unavailable' ||
          e.status === 404 ||
          e.code === 'self_application_forbidden')
      ) {
        onSaved({
          ...job,
          canApply: false,
          applyUnavailableReason: e.code === 'self_application_forbidden' ? 'own_vacancy' : null,
        })
        setUncertain(false)
      }
    } finally {
      lock.current = false
      setBusy(false)
      onBusy(false)
    }
  }
  if (!expanded && job.canApply && !job.myApplication)
    return (
      <section className="candidate-apply-panel">
        <h2>Заинтересовала вакансия?</h2>
        <p>Оставьте контакт, чтобы работодатель мог с вами связаться.</p>
        <Button className="primary-button" onClick={onExpand}>
          Откликнуться
        </Button>
        <div className="vacancy-notice">Контакт передаётся только работодателю этой вакансии.</div>
      </section>
    )
  return (
    <section className="candidate-apply-panel">
      <h2>
        {job.myApplication
          ? 'Вы откликнулись'
          : job.canApply
            ? 'Отклик на вакансию'
            : 'Отклик недоступен'}
      </h2>
      {notice && (
        <p className="vacancy-notice" role="status">
          {notice}
        </p>
      )}
      {error !== undefined && <CandidateError error={error} />}
      {job.myApplication ? (
        <>
          <p>Результат рассмотрения появится в ваших откликах.</p>
          <Link className="text-link" to="/my-applications">
            Перейти к моим откликам →
          </Link>
        </>
      ) : job.applyUnavailableReason === 'own_vacancy' ? (
        <p>Это ваша вакансия. Управлять ею можно в кабинете работодателя.</p>
      ) : (
        job.canApply && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void perform()
            }}
          >
            <div className="candidate-input">
              <label htmlFor="application-contact">Контакт для работодателя</label>
              <Input
                id="application-contact"
                value={contact}
                disabled={busy}
                maxLength={200}
                onChange={(event) => {
                  setContact(event.target.value)
                  setInvalid('')
                }}
                placeholder="Телефон, @имя или ссылка MAX"
                aria-invalid={!!invalid}
                aria-describedby="contact-help"
              />
            </div>
            <p id="contact-help">
              Подтвердите контакт перед отправкой. Его получит работодатель этой вакансии.
            </p>
            {invalid && (
              <p role="alert" className="candidate-field-error">
                {invalid}
              </p>
            )}
            {!uncertain && (
              <Button type="submit" disabled={busy} className="primary-button">
                {busy ? 'Отправляем…' : 'Отправить отклик'}
              </Button>
            )}
          </form>
        )
      )}
      {uncertain && (
        <div className="vacancy-notice">
          <p>Нужно проверить, сохранился ли отклик, прежде чем отправлять его повторно.</p>
          <Button disabled={busy} variant="secondary" onClick={() => void perform(true)}>
            Проверить отклик
          </Button>
        </div>
      )}
      {profile && !profile.hasBotChat && <BotChatNote />}
    </section>
  )
}

export function JobPage() {
  const { id = '' } = useParams(),
    { candidate } = useSession()
  const [busy, setBusy] = useState(false)
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const expanded = params.get('step') === 'apply'
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const load = useCallback(
    (signal: AbortSignal) =>
      /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0
        ? candidate.job(Number(id), signal)
        : Promise.reject(new ApiError('server', 404)),
    [candidate, id],
  )
  const resource = useResource(load, id),
    profile = useResource(candidate.profile, 'profile')
  useRefreshOnReturn(resource.refresh, busy)
  const { result } = resource
  const submitted = result.state === 'ready' && Boolean(result.data.myApplication)
  useEffect(() => {
    if (expanded && result.state === 'ready') stepHeading.current?.focus()
  }, [expanded, result.state, submitted])
  return (
    <>
      <RefreshStatus
        refreshing={resource.isRefreshing}
        failed={!!resource.refreshError}
        retry={resource.refresh}
      />
      {result.state === 'loading' && <Loading />}
      {result.state === 'error' && (
        <>
          <CandidateError error={result.error} retry={resource.reload} />
          <Link className="text-link" to="/jobs">
            К поиску работы
          </Link>
        </>
      )}
      {result.state === 'ready' && (
        <div className={`job-detail-layout ${expanded ? 'application-step' : ''}`}>
          <article className="job-detail">
            <span className="eyebrow">ВАКАНСИЯ</span>
            <h1>{result.data.title}</h1>
            <JobFacts job={result.data} />
            <h2>Условия и обязанности</h2>
            <div className="vacancy-description">
              {result.data.description || 'Работодатель пока не добавил описание.'}
            </div>
            <p>Период и условия оплаты уточняйте у работодателя.</p>
          </article>
          <aside>
            {expanded && (
              <div className="application-step-heading">
                <Button variant="ghost" disabled={busy} onClick={() => setParams({}, { state })}>
                  ← К условиям вакансии
                </Button>
                <h1 ref={stepHeading} tabIndex={-1}>
                  {result.data.myApplication ? 'Отклик отправлен' : 'Как с вами связаться?'}
                </h1>
                <p>{result.data.title}</p>
              </div>
            )}
            {profile.result.state === 'loading' ? (
              <Loading />
            ) : (
              <>
                {profile.result.state === 'error' && (
                  <div className="vacancy-notice">
                    <p>Не удалось загрузить сохранённый контакт. Можно указать его вручную.</p>
                    <Button variant="secondary" onClick={profile.reload}>
                      Загрузить профиль
                    </Button>
                  </div>
                )}
                <ApplyForm
                  key={id}
                  job={result.data}
                  profile={profile.result.state === 'ready' ? profile.result.data : undefined}
                  onSaved={resource.replace}
                  onBusy={setBusy}
                  expanded={expanded}
                  onExpand={() => setParams({ step: 'apply' }, { state })}
                />
              </>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
