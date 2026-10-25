import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Switch } from '@maxhub/max-ui'
import { Input } from '../shared/ui/Input'
import { Select } from '../shared/ui/Select'
import { Modal } from '../shared/ui/Modal'
import { Toast } from '../shared/ui/Toast'
import { fieldError } from '../shared/api/fieldError'
import { displayDate } from '../shared/format'
import { BadgePicker } from '../features/badges/BadgePicker'
import { useCategories } from '../features/categories/useCategories'
import { scheduleLabels } from '../features/vacancies/model'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { RegionSelect } from '../shared/ui/RegionSelect'
import { useSession } from '../features/session/context'
import { useResource, useInvalidateResources } from '../shared/api/useResource'
import { CandidateError, Loading } from '../features/candidate/ui'
import type { PartnerChannel, ChannelInput } from '../features/partners/api'
import '../features/partners/partners.css'

function ChannelEditor({
  channel,
  onEditing,
}: {
  channel: PartnerChannel
  onEditing: (id: number, active: boolean) => void
}) {
  const { partners } = useSession()
  const invalidate = useInvalidateResources()
  const [current, setCurrent] = useState(channel)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState<unknown>()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    onEditing(channel.id, editing || busy)
    return () => onEditing(channel.id, false)
  }, [channel.id, editing, busy, onEditing])
  async function save(input: ChannelInput) {
    if (lock.current || current.removed) return false
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      const result = await partners!.update(current.id, input)
      invalidate()
      setCurrent(result)
      setNotice(
        input.active !== undefined
          ? result.active
            ? 'Автопубликация включена'
            : 'Автопубликация выключена'
          : 'Настройки сохранены',
      )
      return true
    } catch (e) {
      setError(e)
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <article
      className={`partner-card${!current.active || current.removed ? ' is-inactive' : ''}`}
      data-refresh-lock={editing || busy}
      aria-busy={busy}
    >
      <div className="channel-heading">
        <div>
          <h2>{current.title || `Канал № ${current.id}`}</h2>
          <span className="field-hint">{current.isChannel ? 'Канал' : 'Чат'}</span>
        </div>
        <label className="partner-publication-toggle">
          <span>Автопубликация</span>
          <Switch
            aria-label="Автопубликация в канал"
            checked={current.active && !current.removed}
            disabled={busy || current.removed}
            onChange={(e) => void save({ active: e.target.checked })}
          />
        </label>
      </div>
      {current.removed && <p>Добавьте бота в канал снова</p>}
      <div className="channel-statistics">
        <h3>Статистика</h3>
        <p>Опубликовано вакансий · {current.stats?.vacanciesPosted ?? '—'}</p>
        <p>Откликов из канала · {current.stats?.applications ?? '—'}</p>
        <p>Нанято · {current.stats?.hired ?? '—'}</p>
        <small>
          Последний пост:{' '}
          {current.stats?.lastPostedAt
            ? displayDate(current.stats.lastPostedAt, new Date(), 'Europe/Moscow')
            : 'пока нет'}
        </small>
      </div>
      <Button
        variant="secondary"
        disabled={busy || !current.active || current.removed}
        onClick={() => {
          setError(undefined)
          setEditing(true)
        }}
      >
        Настроить
      </Button>
      {!editing && error !== undefined && <CandidateError error={error} />}
      {editing && (
        <Modal
          title={`Настройки: ${current.title || 'Канал'}`}
          onClose={() => {
            if (!lock.current) setEditing(false)
          }}
        >
          <ChannelSettings
            channel={current}
            busy={busy}
            error={error}
            onSave={async (input) => {
              if (await save(input)) setEditing(false)
            }}
          />
        </Modal>
      )}
      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    </article>
  )
}
function ChannelSettings({
  channel,
  busy,
  error,
  onSave,
}: {
  channel: PartnerChannel
  busy: boolean
  error: unknown
  onSave: (input: ChannelInput) => Promise<void>
}) {
  const [region, setRegion] = useState(channel.region?.code ?? '')
  const [categories, setCategories] = useState(channel.categories ?? [])
  const [schedule, setSchedule] = useState(channel.schedule ?? '')
  const [salary, setSalary] = useState(channel.salaryFrom?.toString() ?? '')
  const [badges, setBadges] = useState(channel.badges?.map((b) => b.key) ?? [])
  const [student, setStudent] = useState(channel.studentOnly)
  const [trusted, setTrusted] = useState(channel.trustedOnly ?? false)
  const [mode, setMode] = useState(channel.mode ?? 'instant')
  const [hour, setHour] = useState(channel.digestHour ?? 10)
  const [localError, setLocalError] = useState('')
  const directory = useCategories()
  return (
    <form
      className="channel-settings-form"
      onSubmit={(e) => {
        e.preventDefault()
        const n = salary.replace(/\s/g, '')
        if (n && (!/^\d+$/.test(n) || Number(n) > 10000000)) {
          setLocalError('Введите целую сумму от 0 до 10 000 000 ₽')
          return
        }
        setLocalError('')
        void onSave({
          region_code: region || null,
          categories,
          schedule: (schedule as ChannelInput['schedule']) || null,
          salary_from: n ? Number(n) : null,
          badges,
          student_only: student,
          trusted_only: trusted,
          mode,
          digest_hour: hour,
        })
      }}
    >
      <fieldset disabled={busy} className="partner-settings">
        <RegionSelect value={region} onChange={setRegion} disabled={busy} />
        <div>
          <h3>Сферы деятельности</h3>
          <p className="field-hint">Ничего не выбрано — любые сферы. До 10.</p>
          <div className="category-chips">
            {directory.result.state === 'ready' &&
              directory.result.data.map((c) => (
                <Button
                  key={c.name}
                  type="button"
                  variant="secondary"
                  className="filter-chip"
                  aria-pressed={categories.includes(c.name)}
                  disabled={!categories.includes(c.name) && categories.length >= 10}
                  onClick={() =>
                    setCategories((previous) =>
                      previous.includes(c.name)
                        ? previous.filter((v) => v !== c.name)
                        : [...previous, c.name],
                    )
                  }
                >
                  {c.emoji} {c.name}
                </Button>
              ))}
          </div>
          {directory.result.state === 'error' && (
            <p role="alert">
              Сферы не загружены.{' '}
              <Button type="button" variant="ghost" onClick={directory.reload}>
                Повторить
              </Button>
            </p>
          )}
          {fieldError(error, 'categories') && (
            <p className="field-error" role="alert">
              {fieldError(error, 'categories')}
            </p>
          )}
        </div>
        <label>
          Занятость
          <Select
            label="Занятость"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value as typeof schedule)}
          >
            <option value="">Любая</option>
            {Object.entries(scheduleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Зарплата от, ₽
          <Input
            aria-label="Зарплата от, ₽"
            inputMode="numeric"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
        </label>
        {(localError || fieldError(error, 'salary_from')) && (
          <p className="field-error" role="alert">
            {localError || fieldError(error, 'salary_from')}
          </p>
        )}
        <BadgePicker
          value={badges.join(',')}
          onChange={setBadges}
          error={fieldError(error, 'badges')}
        />
        <label className="switch-line">
          Только для студентов
          <Switch checked={student} onChange={(e) => setStudent(e.target.checked)} />
        </label>
        <label className="switch-line">
          Только надёжные работодатели
          <Switch checked={trusted} onChange={(e) => setTrusted(e.target.checked)} />
        </label>
        <div>
          <h3>Режим публикации</h3>
          <div className="stage-filters" role="group" aria-label="Режим публикации">
            {(['instant', 'digest'] as const).map((value) => (
              <Button
                type="button"
                variant="secondary"
                className="filter-chip"
                aria-pressed={mode === value}
                key={value}
                onClick={() => setMode(value)}
              >
                {value === 'instant' ? 'Сразу' : 'Раз в день'}
              </Button>
            ))}
          </div>
        </div>
        {mode === 'digest' && (
          <label>
            Час по Москве
            <Select
              label="Час по Москве"
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option value={h} key={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </Select>
            <small className="field-hint">Один пост со всеми новыми вакансиями за сутки</small>
          </label>
        )}
        {error !== undefined && <CandidateError error={error} />}
        <Button type="submit" className="primary-button" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </fieldset>
    </form>
  )
}
export function PartnerChannelsPage() {
  const { partners } = useSession()
  const load = useCallback((signal: AbortSignal) => partners!.list(signal), [partners])
  const { result, refresh, refetch, isRefreshing, refreshError } = useResource(
    load,
    'partner-channels',
  )
  const [checking, setChecking] = useState(false)
  const [checkNotice, setCheckNotice] = useState('')
  const checkLock = useRef(false)
  const [editingIds, setEditingIds] = useState<Set<number>>(new Set())
  const onEditing = useCallback(
    (id: number, active: boolean) =>
      setEditingIds((previous) => {
        const next = new Set(previous)
        if (active) next.add(id)
        else next.delete(id)
        return next
      }),
    [],
  )
  useRefreshOnReturn(refresh, editingIds.size > 0)
  async function checkConnection() {
    if (checkLock.current || editingIds.size > 0) return
    checkLock.current = true
    setChecking(true)
    setCheckNotice('')
    try {
      const checked = await refetch({ cancelRefetch: false })
      if (!checked.isError && checked.data) {
        const connected = checked.data.filter((channel) => !channel.removed).length
        setCheckNotice(
          connected
            ? `Проверка завершена. Подключённых каналов и чатов: ${connected}.`
            : 'Подключённые каналы пока не найдены. Проверьте, что бот добавлен в канал с правом публикации и вы вошли в кабинет с того же аккаунта MAX.',
        )
      }
    } finally {
      checkLock.current = false
      setChecking(false)
    }
  }
  const checkBusy = checking || isRefreshing || result.state === 'loading'
  const checkError = result.state === 'error' ? result.error : refreshError
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
          <Button
            type="button"
            variant="secondary"
            disabled={checkBusy || editingIds.size > 0}
            aria-busy={checkBusy}
            onClick={() => void checkConnection()}
          >
            {checkBusy ? 'Проверяем подключение…' : 'Проверить подключение каналов'}
          </Button>
        </div>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          hidden={checkBusy || checkError !== undefined || !checkNotice}
        >
          {!checkBusy && checkError === undefined && checkNotice}
        </div>
        {!checkBusy && checkError !== undefined && <CandidateError error={checkError} />}
      </section>
      {result.state === 'loading' && <Loading />}
      {result.state === 'ready' &&
        (result.data.length ? (
          <div className="partner-grid">
            {result.data.map((channel) => (
              <ChannelEditor
                key={JSON.stringify(channel)}
                channel={channel}
                onEditing={onEditing}
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
