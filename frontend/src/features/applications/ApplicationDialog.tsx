import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { Copy, X } from 'lucide-react'
import { applicationLabels, type Application, type ApplicationStatus } from '../../entities/hiring'
import { useSession } from '../session/context'
import { statuses } from './api'
import {
  applicationError,
  candidateContact,
  candidateName,
  notificationExpected,
  statusNotice,
  type StatusNotice,
} from './model'
import { ApiError } from '../../shared/api/client'

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
  const [current, setCurrent] = useState(application)
  const [target, setTarget] = useState<ApplicationStatus>(application.status)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState<StatusNotice>()
  const [copyMessage, setCopyMessage] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const mounted = useRef(true),
    lock = useRef(false)
  const titleId = useId(),
    statusId = useId()
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
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      if (mounted.current) setCopyMessage('Контакт скопирован.')
    } catch {
      if (mounted.current)
        setCopyMessage('Не удалось скопировать. Выделите и скопируйте контакт вручную.')
    }
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
  async function save() {
    if (lock.current || needsRefresh || target === current.status) return
    lock.current = true
    setBusy(true)
    setFailure('')
    setNotice(undefined)
    try {
      const result = await applications.updateStatus(current.id, target)
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
        setConfirming(false)
      }
    }
  }
  const contact = candidateContact(current)
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
        <button
          type="button"
          className="application-dismiss"
          aria-label="Закрыть карточку кандидата"
          disabled={busy}
          onClick={close}
          autoFocus
        >
          <X size={22} />
        </button>
      </div>
      <div className="application-job">
        <span>ВАКАНСИЯ</span>
        <strong>{current.vacancy.title}</strong>
        {current.vacancy.status === 'closed' && (
          <small>Вакансия закрыта. Работу с полученными откликами можно продолжить.</small>
        )}
      </div>
      <section className="application-contact">
        <h3>Контакт кандидата</h3>
        <p>{contact || 'Кандидат не оставил контакт для связи.'}</p>
        {contact && (
          <Button
            variant="secondary"
            size="small"
            iconBefore={<Copy size={16} />}
            onClick={() => void copy(contact)}
          >
            Копировать контакт
          </Button>
        )}
        {current.candidate.phone?.trim() && current.candidate.phone.trim() !== contact && (
          <p className="secondary-contact">Телефон профиля: {current.candidate.phone}</p>
        )}
        {copyMessage && (
          <p className="copy-result" role="status">
            {copyMessage}
          </p>
        )}
      </section>
      <dl className="application-dates">
        <div>
          <dt>Отклик получен</dt>
          <dd>
            {new Date(current.createdAt).toLocaleString('ru-RU', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </dd>
        </div>
        <div>
          <dt>Обновлён</dt>
          <dd>
            {new Date(current.updatedAt).toLocaleString('ru-RU', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </dd>
        </div>
      </dl>
      <section className="application-status-editor" aria-busy={busy}>
        <div className="application-current">
          <h3>Этап найма</h3>
          <span className={`application-status ${current.status}`}>
            {applicationLabels[current.status]}
          </span>
        </div>
        {notice && (
          <div
            className={`application-notice ${notice.tone}`}
            role={notice.tone === 'warning' ? 'alert' : 'status'}
          >
            {notice.text}
          </div>
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
        <label htmlFor={statusId}>Новый этап</label>
        <select
          id={statusId}
          value={target}
          disabled={busy || needsRefresh || confirming}
          onChange={(event) => {
            setTarget(event.target.value as ApplicationStatus)
            setNotice(undefined)
          }}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {applicationLabels[status]}
            </option>
          ))}
        </select>
        <p className="application-status-hint">
          {mode === 'preview'
            ? 'В демо статус изменится только в памяти браузера.'
            : notificationExpected(target)
              ? 'При изменении на этот этап бот отправит кандидату уведомление в MAX.'
              : 'Этот этап сохраняется без автоматического уведомления кандидата.'}
        </p>
        {confirming && (
          <div className="application-confirm" role="status">
            Изменить статус на «{applicationLabels[target]}»?{' '}
            {mode === 'max' && notificationExpected(target)
              ? 'Кандидату будет отправлено уведомление.'
              : ''}
          </div>
        )}
        <div className="application-dialog-actions">
          {confirming ? (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Отмена
              </Button>
              <Button className="primary-button" disabled={busy} onClick={() => void save()}>
                {busy ? 'Сохраняем…' : 'Подтвердить изменение'}
              </Button>
            </>
          ) : (
            <Button
              className="primary-button"
              disabled={busy || needsRefresh || target === current.status}
              onClick={() => setConfirming(true)}
            >
              Изменить статус
            </Button>
          )}
        </div>
        {blocker.state === 'blocked' && (
          <p role="status">Дождитесь завершения запроса перед выходом.</p>
        )}
      </section>
    </dialog>
  )
}
