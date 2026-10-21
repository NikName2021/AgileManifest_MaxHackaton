import { useCallback, useRef, useState } from 'react'
import { Button, Switch } from '@maxhub/max-ui'
import { RegionSelect } from '../shared/ui/RegionSelect'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { CandidateError, Loading } from '../features/candidate/ui'
import type { PartnerChannel } from '../features/partners/api'
import '../features/partners/partners.css'

function ChannelEditor({ channel }: { channel: PartnerChannel }) {
  const { partners, mode } = useSession()
  const [region, setRegion] = useState(channel.region?.code ?? '')
  const [student, setStudent] = useState(channel.studentOnly)
  const [active, setActive] = useState(channel.active)
  const [busy, setBusy] = useState(false),
    lock = useRef(false)
  const [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState('')
  async function save(nextActive = active) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(undefined)
    setNotice('')
    try {
      const result = await partners!.update(channel.id, {
        active: nextActive,
        region_code: region || null,
        student_only: student,
      })
      setActive(result.active)
      setRegion(result.region?.code ?? '')
      setStudent(result.studentOnly)
      setNotice(
        mode === 'preview'
          ? 'Настройки сохранены в демо. Публикаций не будет.'
          : result.active
            ? 'Автопубликация новых подходящих вакансий включена.'
            : 'Автопубликация выключена.',
      )
    } catch (e) {
      setError(e)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <article
      className={`partner-card${!active || channel.removed ? ' is-inactive' : ''}`}
      aria-busy={busy}
    >
      <h2>{channel.title || `${channel.isChannel ? 'Канал' : 'Чат'} № ${channel.id}`}</h2>
      {channel.removed ? (
        <p role="status">Бот удалён из канала. Добавьте его снова и проверьте подключение.</p>
      ) : (
        <>
          <label className="partner-publication-toggle">
            <span>
              <strong>Автопубликация</strong>
              <span>{busy ? 'Сохраняем…' : active ? 'Включена' : 'Выключена'}</span>
            </span>
            <Switch
              aria-label="Автопубликация в канал"
              checked={active}
              disabled={busy}
              onChange={(e) => void save(e.target.checked)}
            />
          </label>
          <fieldset className="partner-settings" disabled={busy || !active}>
            <RegionSelect value={region} onChange={setRegion} disabled={busy || !active} />
            <label className="student-check">
              <input
                type="checkbox"
                checked={student}
                onChange={(e) => setStudent(e.target.checked)}
              />
              Только вакансии для студентов
            </label>
            <Button
              className="primary-button"
              disabled={busy || !active}
              onClick={() => void save()}
            >
              Сохранить настройки
            </Button>
          </fieldset>
        </>
      )}
      {error !== undefined && <CandidateError error={error} />}
      {notice && <p role="status">{notice}</p>}
    </article>
  )
}
export function PartnerChannelsPage() {
  const { partners } = useSession()
  const load = useCallback((signal: AbortSignal) => partners!.list(signal), [partners])
  const { result, reload } = useResource(load, 'partner-channels')
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">КАБИНЕТ ПАРТНЁРА</span>
          <h1>Каналы вуза и студотряда</h1>
          <p>Публикуйте подходящие вакансии в своих каналах MAX.</p>
        </div>
      </div>
      <section className="partner-instructions">
        <h2>Как подключить канал</h2>
        <ol>
          <li>
            Добавьте бота «Сезон» в свой канал или чат MAX и дайте ему право публиковать сообщения.
          </li>
          <li>Откройте этот кабинет из того же аккаунта MAX, которым добавили бота.</li>
          <li>
            Включите автопубликацию, выберите регион и сохраните настройки. Новые подходящие
            вакансии будут поступать автоматически.
          </li>
        </ol>
        <p>
          Здесь отображаются только подключённые вами каналы. Добавление бота само по себе не
          включает рассылку.
        </p>
        <div className="partner-actions">
          <Button variant="secondary" onClick={reload}>
            Проверить подключение каналов
          </Button>
        </div>
      </section>
      {result.state === 'loading' && <Loading />}
      {result.state === 'error' && <CandidateError error={result.error} retry={reload} />}
      {result.state === 'ready' &&
        (result.data.length ? (
          <div className="partner-grid">
            {result.data.map((channel) => (
              <ChannelEditor
                key={`${channel.id}:${channel.active}:${channel.region?.code}:${channel.studentOnly}:${channel.removed}`}
                channel={channel}
              />
            ))}
          </div>
        ) : (
          <section className="empty-panel">
            <h2>Каналы ещё не подключены</h2>
            <p>Выполните шаги выше, затем проверьте подключение.</p>
          </section>
        ))}
    </>
  )
}
