import { useCallback, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { BadgeCheck, ArrowRight } from 'lucide-react'
import { useSession } from '../features/session/context'
import { useResource, useInvalidateResources } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { CandidateError, Loading } from '../features/candidate/ui'
import { Modal } from '../shared/ui/Modal'
import { Toast } from '../shared/ui/Toast'
import { initials } from '../shared/format'
import { outcomes, type TeamMember } from '../features/team/api'
import '../features/team/team.css'

export function TeamPage() {
  const { team, vacancies, mode, loadApplicationExamples } = useSession()
  const invalidate = useInvalidateResources()
  const [params] = useSearchParams()
  const load = useCallback((signal: AbortSignal) => team!.list(signal), [team])
  const people = useResource(load, 'team')
  const jobs = useResource(vacancies.list, 'team-vacancies')
  const [busy, setBusy] = useState(false),
    lock = useRef(false)
  const [error, setError] = useState<unknown>()
  const [notice, setNotice] = useState('')
  const [choosing, setChoosing] = useState<TeamMember | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [uncertain, setUncertain] = useState<Set<string>>(new Set())
  const options =
    jobs.result.state === 'ready' ? jobs.result.data.filter((v) => v.status === 'published') : []
  const preferred =
    options.find((v) => v.id === Number(params.get('vacancy'))) ??
    (options.length === 1 ? options[0] : undefined)
  const jobIds =
    jobs.result.state === 'ready'
      ? jobs.result.data
          .filter((v) => v.status === 'published')
          .map((v) => v.id)
          .join(',')
      : ''
  const loadInvites = useCallback(
    async (signal: AbortSignal) => {
      const result = await Promise.all(
        jobIds
          .split(',')
          .filter(Boolean)
          .map(async (id) => ({ id: Number(id), rows: await team!.invites(Number(id), signal) })),
      )
      return new Set(
        result.flatMap((v) =>
          v.rows.filter((i) => i.status !== 'undelivered').map((i) => `${v.id}:${i.candidate.id}`),
        ),
      )
    },
    [team, jobIds],
  )
  const invites = useResource(loadInvites, `team:invites:${jobIds}`)
  const { refresh: refreshPeople } = people,
    { refresh: refreshJobs } = jobs,
    { refresh: refreshInvites } = invites
  const refresh = useCallback(() => {
    refreshPeople()
    refreshJobs()
    refreshInvites()
  }, [refreshPeople, refreshJobs, refreshInvites])
  useRefreshOnReturn(refresh, busy || choosing !== null)
  const already = (jobId: number, id: number) =>
    sent.has(`${jobId}:${id}`) ||
    (invites.result.state === 'ready' && invites.result.data.has(`${jobId}:${id}`))
  async function invite(jobId: number, member: TeamMember) {
    const key = `${jobId}:${member.candidate.id}`
    if (lock.current || already(jobId, member.candidate.id) || uncertain.has(key)) return
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      const result = await team!.invite(jobId, [member.candidate.id])
      invalidate()
      const outcome = result.results.find((r) => r.candidateId === member.candidate.id)?.outcome
      if (outcome && ['sent', 'already_invited', 'already_applied'].includes(outcome))
        setSent((previous) => new Set([...previous, key]))
      setNotice(
        outcome === 'no_bot_chat'
          ? 'Человек ещё не открыл чат с ботом — пригласить не получится'
          : outcome
            ? outcomes[outcome]
            : 'Отправка не подтверждена',
      )
      setChoosing(null)
      invites.refresh()
    } catch (e) {
      setError(e)
      setUncertain((previous) => new Set([...previous, key]))
      invites.refresh()
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function mark(m: TeamMember) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      await team!.mark(m.candidate.id, !m.reliable)
      invalidate()
      people.refresh()
      setNotice('Сохранено')
    } catch (e) {
      setError(e)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const members = people.result.state === 'ready' ? people.result.data : []
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">КАБИНЕТ РАБОТОДАТЕЛЯ</span>
          <h1>Команда</h1>
        </div>
      </div>
      {mode === 'preview' && loadApplicationExamples && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await loadApplicationExamples()
              refresh()
            } catch (e) {
              setError(e)
            } finally {
              setBusy(false)
            }
          }}
        >
          Загрузить демо-команду
        </Button>
      )}
      {people.result.state === 'loading' && <Loading />}
      {people.result.state === 'error' && (
        <CandidateError error={people.result.error} retry={people.reload} />
      )}
      {jobs.result.state === 'error' && (
        <CandidateError error={jobs.result.error} retry={jobs.reload} />
      )}
      {invites.result.state === 'error' && (
        <CandidateError error={invites.result.error} retry={invites.reload} />
      )}
      {error && <CandidateError error={error} />}
      {uncertain.size > 0 && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            if (lock.current) return
            lock.current = true
            setBusy(true)
            try {
              const actual = await loadInvites(new AbortController().signal)
              setSent((previous) => new Set([...previous, ...actual]))
              setUncertain(new Set())
              setError(undefined)
              refreshInvites()
              setNotice('Приглашения обновлены')
            } catch (e) {
              setError(e)
            } finally {
              lock.current = false
              setBusy(false)
            }
          }}
        >
          Проверить отправку приглашений
        </Button>
      )}
      {people.result.state === 'ready' && !members.length && (
        <section className="empty-panel">
          <h2>Команда появится после первого найма</h2>
          <p>Отметьте кандидата как нанятого в откликах.</p>
          <Button asChild className="primary-button">
            <Link to="/applications">
              Открыть отклики
              <ArrowRight size={18} />
            </Link>
          </Button>
        </section>
      )}
      {!!members.length && (
        <div className="employer-list team-rows">
          {members.map((m) => {
            const name = m.candidate.displayName || `Сотрудник № ${m.candidate.id}`
            const invited = preferred
              ? already(preferred.id, m.candidate.id)
              : options.length > 0 && options.some((v) => already(v.id, m.candidate.id))
            const unknown = preferred && uncertain.has(`${preferred.id}:${m.candidate.id}`)
            const date = m.lastHiredAt ? new Date(m.lastHiredAt) : null
            const season = date
              ? `${['зима', 'весна', 'лето', 'осень'][Math.floor(((date.getMonth() + 1) % 12) / 3)]} ${date.getFullYear()}`
              : ''
            return (
              <article key={m.candidate.id} className="person-row">
                <span className="candidate-avatar">{initials(name)}</span>
                <div className="row-description">
                  <strong>{name}</strong>
                  <small>
                    {m.lastVacancy.title}
                    {season && ` · ${season}`}
                  </small>
                  <Button
                    variant="ghost"
                    size="small"
                    className="reliable-button"
                    aria-pressed={m.reliable}
                    disabled={busy}
                    onClick={() => void mark(m)}
                  >
                    <BadgeCheck size={16} />
                    {m.reliable ? 'Надёжный' : 'Отметить надёжным'}
                  </Button>
                </div>
                <div>
                  <Button
                    variant="secondary"
                    disabled={
                      busy ||
                      invited ||
                      !!unknown ||
                      !options.length ||
                      invites.result.state !== 'ready'
                    }
                    onClick={() => (preferred ? void invite(preferred.id, m) : setChoosing(m))}
                  >
                    {invited ? 'Приглашён' : unknown ? 'Проверяем отправку' : 'Позвать снова'}
                  </Button>
                  {!options.length && (
                    <small className="field-hint">Сначала опубликуйте вакансию</small>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
      {choosing && (
        <Modal
          title={`Позвать снова: ${choosing.candidate.displayName || 'Сотрудник'}`}
          onClose={() => {
            if (!busy) setChoosing(null)
          }}
        >
          <div className="selection-list">
            {options.map((v) => (
              <Button
                variant="secondary"
                key={v.id}
                disabled={
                  busy ||
                  already(v.id, choosing.candidate.id) ||
                  uncertain.has(`${v.id}:${choosing.candidate.id}`)
                }
                onClick={() => void invite(v.id, choosing)}
              >
                {v.title}
                {already(v.id, choosing.candidate.id) ? ' · Приглашён' : ''}
              </Button>
            ))}
          </div>
        </Modal>
      )}
      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    </>
  )
}
