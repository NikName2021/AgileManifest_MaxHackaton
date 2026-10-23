import { useInvalidateResources } from '../../shared/api/useResource'
import { useRef, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { Input } from '../../shared/ui/Input'
import { Link } from 'react-router-dom'
import type { Application } from '../../entities/hiring'
import { useSession } from '../session/context'
import { applicationError, type StatusNotice } from '../applications/model'
import { shiftDate, shiftInput } from './model'
import { ShiftSummary } from './ShiftSummary'

export function ShiftEditor({
  application,
  disabled,
  onBusy,
  onSaved,
}: {
  application: Application
  disabled: boolean
  onBusy: (busy: boolean) => void
  onSaved: (application: Application, notice: StatusNotice) => void
}) {
  const { applications, mode } = useSession()
  const invalidate = useInvalidateResources()
  const [time, setTime] = useState(shiftInput(application.startAt))
  const [note, setNote] = useState(application.shiftNote ?? '')
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const lock = useRef(false)
  if (!['invited', 'hired'].includes(application.status))
    return <ShiftSummary shift={application} />
  async function save(clear = false) {
    if (lock.current || disabled || uncertain || !applications.setShift) return
    let start: string | null
    try {
      start = clear ? null : shiftDate(time)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    lock.current = true
    onBusy(true)
    setError('')
    try {
      const result = await applications.setShift(
        application.id,
        start,
        clear ? null : note.trim() || null,
      )
      invalidate()
      setTime(shiftInput(result.startAt))
      setNote(result.shiftNote ?? '')
      onSaved(
        { ...application, ...result },
        {
          tone: result.notified || !start || mode === 'preview' ? 'success' : 'warning',
          text: !start
            ? 'Смена отменена.'
            : mode === 'preview'
              ? 'Смена сохранена в демо. Сообщения не отправляются.'
              : result.notified
                ? 'Смена назначена. Кандидату отправлен запрос подтверждения.'
                : 'Смена назначена, но уведомление не доставлено. Свяжитесь с кандидатом.',
        },
      )
    } catch (e) {
      setError(applicationError(e))
      setUncertain(true)
    } finally {
      lock.current = false
      onBusy(false)
    }
  }
  async function check() {
    if (lock.current) return
    lock.current = true
    onBusy(true)
    try {
      const snapshot = await applications.forVacancy(application.vacancyId)
      const actual = snapshot.items.find((item) => item.id === application.id)
      if (!actual) throw new Error()
      setTime(shiftInput(actual.startAt))
      setNote(actual.shiftNote ?? '')
      setUncertain(false)
      setError('')
      onSaved(actual, {
        tone: 'warning',
        text: 'Данные смены обновлены. Результат доставки предыдущего уведомления неизвестен.',
      })
    } catch {
      setError('Не удалось проверить смену. Повторите проверку.')
    } finally {
      lock.current = false
      onBusy(false)
    }
  }
  return (
    <section className="shift-editor">
      <h3>Выход на смену</h3>
      <ShiftSummary shift={application} />
      {application.attendance === 'declined' && (
        <p>
          Кандидат отказался от выхода.{' '}
          <Link to={`/applications?vacancy=${application.vacancyId}&status=new`}>
            Посмотреть новых кандидатов
          </Link>
        </p>
      )}
      <label>
        Дата и время выхода (МСК)
        <Input
          type="datetime-local"
          aria-label="Дата и время выхода (МСК)"
          value={time}
          disabled={disabled || uncertain}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <label>
        Инструкция кандидату
        <Input
          aria-label="Инструкция кандидату"
          value={note}
          maxLength={200}
          disabled={disabled || uncertain}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p>При переносе времени потребуется новое подтверждение кандидата.</p>
      {error && <p role="alert">{error}</p>}
      {uncertain ? (
        <Button disabled={disabled} onClick={() => void check()}>
          Проверить сохранённую смену
        </Button>
      ) : (
        <div className="application-dialog-actions">
          <Button
            className="primary-button"
            disabled={disabled || !time}
            onClick={() => void save()}
          >
            Назначить смену
          </Button>
          {application.startAt && (
            <Button variant="secondary" disabled={disabled} onClick={() => void save(true)}>
              Отменить смену
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
