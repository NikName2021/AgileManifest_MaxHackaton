import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from '@maxhub/max-ui'

export function ConfirmDialog({
  title,
  children,
  confirm,
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string
  children: ReactNode
  confirm: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId(),
    bodyId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])
  return (
    <dialog
      className="confirm-dialog"
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <div id={bodyId}>{children}</div>
      <div className="vacancy-actions">
        <Button variant="secondary" autoFocus disabled={busy} onClick={onCancel}>
          Отмена
        </Button>
        <Button className="primary-button" disabled={busy} onClick={onConfirm}>
          {busy ? 'Подождите…' : confirm}
        </Button>
      </div>
    </dialog>
  )
}
