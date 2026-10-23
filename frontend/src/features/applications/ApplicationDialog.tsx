import { useInvalidateResources } from '../../shared/api/useResource'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { X } from 'lucide-react'
import { CandidateContacts } from './CandidateContacts'
import { Toast } from '../../shared/ui/Toast'
import { Pill } from '../../shared/ui/Pill'
import { displayDate, initials } from '../../shared/format'
import { applicationLabels, type Application, type ApplicationStatus } from '../../entities/hiring'
import { useSession } from '../session/context'
import { statuses } from './api'
import {
  applicationError,
  candidateName,
  notificationExpected,
  statusNotice,
  type StatusNotice,
} from './model'
import { ApiError } from '../../shared/api/client'
import { ShiftEditor } from '../shifts/ShiftEditor'

export function ApplicationDialog({
  application,
  onClose,
  onChanged,
}: {
  application: Application
  onClose: () => void
  onChanged: (notice: StatusNotice) => void
}) {
  const { applications, mode } = useSession()
  const invalidate = useInvalidateResources()
  const [current, setCurrent] = useState(application)
  const [target, setTarget] = useState<ApplicationStatus>(application.status)
  const [busy, setBusy] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState<StatusNotice>()
  const dialog = useRef<HTMLDialogElement>(null)
  const mounted = useRef(true),
    lock = useRef(false)
  const titleId = useId()
  const blocker = useBlocker(() => lock.current)
  useBeforeUnload(
    useCallback(
      (event) => {
        if (busy) {
          event.preventDefault()
          event.returnValue = ''
        }
      },
      [busy],
    ),
  )
  useEffect(() => {
    mounted.current = true
    const element = dialog.current!,
      previous = document.activeElement
    element.showModal()
    return () => {
      mounted.current = false
      element.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  useEffect(() => {
    if (!busy && blocker.state === 'blocked') blocker.reset()
  }, [busy, blocker])

  function close() {
    if (!lock.current) onClose()
  }
  async function reconcile() {
    const snapshot = await applications.forVacancy(current.vacancyId)
    const actual = snapshot.items.find((item) => item.id === current.id)
    if (!actual) throw new ApiError('server', 404, 'not_found')
    if (!mounted.current) return
    setCurrent(actual)
    setTarget(actual.status)
    setNeedsRefresh(false)
    const message: StatusNotice = {
      tone: 'warning',
      text: notificationExpected(target)
        ? `Актуальный статус: «${applicationLabels[actual.status]}». Результат отправки уведомления неизвестен; при необходимости свяжитесь с кандидатом.`
        : `Актуальный статус: «${applicationLabels[actual.status]}». Проверьте его перед дальнейшими действиями.`,
    }
    setNotice(message)
    onChanged(message)
  }
  async function refresh() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      await reconcile()
      if (mounted.current) setFailure('')
    } catch (error) {
      if (mounted.current) setFailure(applicationError(error))
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function save(nextTarget: ApplicationStatus) {
    if (lock.current || needsRefresh || nextTarget === current.status) return
    lock.current = true
    setBusy(true)
    setFailure('')
    setTarget(nextTarget)
    setNotice(undefined)
    try {
      const result = await applications.updateStatus(current.id, nextTarget)
      invalidate()
      if (!mounted.current) return
      setCurrent(result.application)
      setTarget(result.application.status)
      const message = statusNotice(result, mode === 'preview')
      setNotice(message)
      onChanged(message)
    } catch (error) {
      if (!mounted.current) return
      setFailure(applicationError(error))
      setNeedsRefresh(true)
      try {
        await reconcile()
      } catch {
        /* A second write stays blocked until a successful read confirms current state. */
      }
    } finally {
      lock.current = false
      if (mounted.current) {
        setBusy(false)
      }
    }
  }
  return (
    <dialog
      className="application-dialog"
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <div className="application-dialog-heading">
        <div>
          <div className="eyebrow">ОТКЛИК № {current.id}</div>
          <h2 id={titleId}>{candidateName(current)}</h2>
        </div>
        <Button
          variant="ghost"
          type="button"
          className="application-dismiss"
          aria-label="Закрыть карточку кандидата"
          disabled={busy}
          onClick={close}
          autoFocus
        >
          <X size={22} />
        </Button>
      </div>
      <div className="application-person-summary">
        <span className="candidate-avatar">{initials(candidateName(current))}</span>
        <div>
          <strong>{current.vacancy.title}</strong>
          <p>{displayDate(current.createdAt)}</p>
        </div>
        <Pill tone={current.status}>{applicationLabels[current.status]}</Pill>
      </div>
      <CandidateContacts application={current} compact />
      {current.vacancy.status === 'closed' && (
        <p className="field-hint">
          Вакансия закрыта. История отклика сохранена; этап можно обновить.
        </p>
      )}
      <section className="application-status-editor" aria-busy={busy}>
        <div className="application-current">
          <h3>Этап найма</h3>
          <Pill tone={`application-status ${current.status}`}>
            {applicationLabels[current.status]}
          </Pill>
        </div>
        {notice && (
          <Toast
            message={notice.tone === 'success' ? 'Этап изменён' : notice.text}
            onClose={() => setNotice(undefined)}
          />
        )}
        {failure && (
          <div className="application-notice error" role="alert">
            {failure}
          </div>
        )}
        {needsRefresh && (
          <div className="application-notice warning">
            <p>
              Результат изменения пока неизвестен. Сначала обновите данные; статус повторно не
              отправляется.
            </p>
            <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
              Проверить текущий статус
            </Button>
          </div>
        )}
        <div className="stage-filters" role="group" aria-label="Изменить этап">
          {statuses.map((status) => (
            <Button
              key={status}
              variant="secondary"
              className={`filter-chip stage-${status}`}
              aria-pressed={current.status === status}
              disabled={busy || needsRefresh}
              onClick={() => void save(status)}
            >
              {applicationLabels[status]}
            </Button>
          ))}
        </div>
        <p className="application-status-hint">
          {current.status === 'invited'
            ? 'Кандидат увидит ваш контакт и получит его в сообщении'
            : 'Кандидат увидит новый этап'}
        </p>
        {blocker.state === 'blocked' && (
          <p role="status">Дождитесь завершения запроса перед выходом.</p>
        )}
      </section>
      <ShiftEditor
        application={current}
        disabled={busy || needsRefresh}
        onBusy={(value) => {
          lock.current = value
          setBusy(value)
        }}
        onSaved={(actual, message) => {
          setCurrent(actual)
          setNotice(message)
          onChanged(message)
        }}
      />
    </dialog>
  )
}
