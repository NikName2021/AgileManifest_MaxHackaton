import { useEffect, useId, useRef, useState } from 'react'
import { Button, Typography } from '@maxhub/max-ui'
import { formatPublicationDate } from './publicationDate'

export function JobPublicationDate({ value }: { value: string }) {
  const label = formatPublicationDate(value)
  const recent = label === 'Сегодня' || label === 'Вчера'
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  const container = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  return (
    <span
      ref={container}
      className={`publication-date${recent ? ' is-recent' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false)
          event.stopPropagation()
        }
      }}
    >
      <Button
        type="button"
        variant="ghost"
        className="publication-date-trigger"
        aria-label={`Дата публикации: ${label}`}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        <time dateTime={value}>{label}</time>
      </Button>
      {open && (
        <Typography.Body
          variant="small"
          role="tooltip"
          id={tooltipId}
          className="publication-tooltip"
        >
          Дата публикации вакансии
        </Typography.Body>
      )}
    </span>
  )
}
