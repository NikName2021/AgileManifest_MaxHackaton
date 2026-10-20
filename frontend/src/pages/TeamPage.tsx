import { useCallback, useRef, useState } from 'react'
import { Link, useSearchParams, useBlocker, useBeforeUnload } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { useSession } from '../features/session/context'
import { Select } from '../shared/ui/Select'
import { useResource } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { CandidateError, Loading } from '../features/candidate/ui'
import { Contact } from '../features/applications/CandidateContacts'
import { outcomes, inviteStatuses, type InviteResult, type TeamMember } from '../features/team/api'
import { config } from '../shared/config'
import '../features/team/team.css'

export function TeamPage() {
  const { team, vacancies, mode, loadApplicationExamples } = useSession()
  const [params, setParams] = useSearchParams()
  const vacancyId = Number(params.get('vacancy')) || 0
  const load = useCallback((signal: AbortSignal) => team!.list(signal), [team])
  const people = useResource(load, 'team')
  const jobs = useResource(vacancies.list, 'team-vacancies')
  const loadInvites = useCallback((signal: AbortSignal) => vacancyId ? team!.invites(vacancyId, signal) : Promise.resolve([]), [team, vacancyId])
  const invites = useResource(loadInvites, String(vacancyId))
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false), lock = useRef(false)
  const [error, setError] = useState<unknown>()
  const [result, setResult] = useState<InviteResult>()
  const [confirm, setConfirm] = useState<'all' | 'selected' | null>(null)
  const { refresh: refreshPeople } = people, { refresh: refreshJobs } = jobs, { refresh: refreshInvites } = invites
  const refresh = useCallback(() => { refreshPeople(); refreshJobs(); refreshInvites() }, [refreshPeople, refreshJobs, refreshInvites])
  const blocker = useBlocker(() => lock.current)
  useBeforeUnload(useCallback((event) => { if (lock.current) { event.preventDefault(); event.returnValue = '' } }, []))
  useRefreshOnReturn(refresh, busy || !!confirm)
  const members = people.result.state === 'ready' ? people.result.data : []
  const options = jobs.result.state === 'ready' ? jobs.result.data : []
  const canInvite = options.some((v) => v.id === vacancyId && v.status === 'published')
  const link = options.find((v) => v.id === vacancyId)?.applyUrl ?? (config.botUrl && vacancyId ? (() => {
    const url = new URL(config.botUrl!); url.searchParams.set('start', `apply_${vacancyId}`); return url.href
  })() : null)
  async function action(work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(undefined)
    try { await work(); refresh() } catch (e) { setError(e); refresh() }
    finally { lock.current = false; setBusy(false); setConfirm(null) }
  }
  const mark = (m: TeamMember) => action(() => team!.mark(m.candidate.id, !m.reliable))
  return <>
    <div className="page-heading"><div><span className="eyebrow">КАБИНЕТ РАБОТОДАТЕЛЯ</span>
      <h1>Моя команда</h1><p>Люди, которых вы уже нанимали. Пригласите их на новый сезон.</p></div></div>
    {mode === 'preview' && loadApplicationExamples && <Button variant="secondary" disabled={busy}
      onClick={() => void action(loadApplicationExamples)}>Загрузить демо-команду</Button>}
    {people.result.state === 'loading' && <Loading />}
    {people.result.state === 'error' && <CandidateError error={people.result.error} retry={people.reload} />}
    {jobs.result.state === 'error' && <CandidateError error={jobs.result.error} retry={jobs.reload} />}
    {error && <CandidateError error={error} />}
    {blocker.state === 'blocked' && <p role="status">Дождитесь завершения операции. <button disabled={busy} onClick={() => blocker.reset()}>Остаться на странице</button></p>}
    {(people.refreshError || jobs.refreshError || invites.refreshError) && <p role="alert">Не удалось обновить данные. <button onClick={refresh}>Повторить</button></p>}
    {people.result.state === 'ready' && !members.length && <section className="empty-panel">
      <h2>Команда появится после первого найма</h2><p>Отметьте кандидата как нанятого в откликах.</p><Link to="/applications">Открыть отклики</Link></section>}
    {!!members.length && <>
      <section className="team-toolbar">
        <label>Вакансия для приглашения<Select label="Вакансия для приглашения" value={vacancyId || ''} disabled={busy}
          onChange={(e) => { setParams(e.target.value ? { vacancy: e.target.value } : {}); setResult(undefined); setConfirm(null) }}>
          <option value="">Выберите вакансию</option>
          {options.map((v) => <option key={v.id} value={v.id}>{v.title}{v.status !== 'published' ? ' · не опубликована' : ''}</option>)}
        </Select></label>
        <div className="team-actions">
          <Button disabled={busy || !canInvite || !selected.length || selected.length > 100} onClick={() => setConfirm('selected')}>Пригласить выбранных ({selected.length})</Button>
          <Button variant="secondary" disabled={busy || !canInvite} onClick={() => setConfirm('all')}>Пригласить всю команду</Button>
        </div>
        <p>До 100 приглашений за запрос. Уже приглашённые не получат повторное сообщение.</p>
        {confirm && <div className="application-notice warning">
          <p>Отправить приглашение {confirm === 'all' ? 'всей команде' : `${selected.length} выбранным сотрудникам`} в MAX?</p>
          <div className="team-actions"><Button disabled={busy} onClick={() => void action(async () => {
            setResult(await team!.invite(vacancyId, confirm === 'all' ? undefined : selected))
          })}>Подтвердить приглашение</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>Отмена</Button></div>
        </div>}
        {link && <p>Если у сотрудника нет чата с ботом, передайте <a href={link} target="_blank" rel="noreferrer">ссылку на отклик</a>.</p>}
        {result && <div role="status"><strong>{mode === 'preview' ? 'Демо: сообщения не отправлялись.' : `Отправлено: ${result.sent}`}</strong>
          <ul>{result.results.map((r) => <li key={r.candidateId}>{members.find((m) => m.candidate.id === r.candidateId)?.candidate.displayName || `Сотрудник № ${r.candidateId}`}: {outcomes[r.outcome]}</li>)}</ul>
        </div>}
      </section>
      <div className="team-list">{members.map((m) => <article className="team-member" key={m.candidate.id}>
        <label className="team-selection"><input type="checkbox" checked={selected.includes(m.candidate.id)} disabled={busy}
          onChange={(e) => setSelected(e.target.checked ? [...selected, m.candidate.id] : selected.filter((id) => id !== m.candidate.id))} />
          <strong>{m.candidate.displayName || `Сотрудник № ${m.candidate.id}`}</strong></label>
        <p>Наймов: {m.hiredCount} · Последняя вакансия: <Link to={`/vacancies/${m.lastVacancy.id}`}>{m.lastVacancy.title}</Link></p>
        {m.lastHiredAt && <p>Последний найм: {new Date(m.lastHiredAt).toLocaleDateString('ru-RU')}</p>}
        {m.contact && <Contact value={m.contact} />}
        {!m.hasBotChat && <small>Нет чата с ботом — отправьте ссылку вручную.</small>}
        <Button variant="secondary" size="small" disabled={busy} aria-pressed={m.reliable} onClick={() => void mark(m)}>
          {m.reliable ? '✓ Надёжный · убрать отметку' : 'Отметить надёжным'}</Button>
      </article>)}</div>
    </>}
    {!!vacancyId && <section className="team-toolbar"><h2>Ответы на приглашения</h2>
      {invites.result.state === 'loading' && <Loading />}
      {invites.result.state === 'error' && <CandidateError error={invites.result.error} retry={invites.reload} />}
      {invites.result.state === 'ready' && (invites.result.data.length ? <ul>{invites.result.data.map((i) =>
        <li key={i.id}>{i.candidate.displayName || `Сотрудник № ${i.candidate.id}`} — {inviteStatuses[i.status]}</li>)}</ul> : <p>Приглашений пока нет.</p>)}
    </section>}
  </>
}
