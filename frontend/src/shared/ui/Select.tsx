import { Input } from './Input'
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { Button, Radio } from '@maxhub/max-ui'
import { ChevronDown, X } from 'lucide-react'
import { createPortal } from 'react-dom'

type Props = SelectHTMLAttributes<HTMLSelectElement> & { label: string }
type Option = { value: string; label: string; disabled: boolean }
function readOptions(children: ReactNode): Option[] {
  const result: Option[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode; value?: string; disabled?: boolean }>(child)) return
    if (child.type === Fragment) result.push(...readOptions(child.props.children))
    else if (child.type === 'option')
      result.push({
        value: String(child.props.value ?? child.props.children ?? ''),
        label: Children.toArray(child.props.children).join(''),
        disabled: Boolean(child.props.disabled),
      })
  })
  return result
}

// MAX UI 0.5 has no Select. Its Button/Input/Radio compose a native modal picker.
// A hidden native select keeps FormData, fieldset disabling and real change events.
export function Select({
  label,
  children,
  value,
  defaultValue,
  onChange,
  id,
  className,
  ...props
}: Props) {
  const options = readOptions(children)
  const initial = String(defaultValue ?? options[0]?.value ?? '')
  const [local, setLocal] = useState(initial)
  const [open, setOpen] = useState(false)
  const [portal, setPortal] = useState<Element | null>(null)
  const [search, setSearch] = useState('')
  const current = String(value ?? local)
  const native = useRef<HTMLSelectElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const uid = useId(),
    titleId = `${uid}-title`,
    dialogId = `${uid}-dialog`
  const visible = options.filter((option) =>
    option.label.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')),
  )
  useEffect(() => {
    const form = native.current?.form
    function reset() {
      if (value === undefined) setLocal(initial)
    }
    form?.addEventListener('reset', reset)
    return () => form?.removeEventListener('reset', reset)
  }, [initial, value])
  useEffect(() => {
    if (!open) return
    const element = dialog.current!
    element.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.querySelector<HTMLInputElement>('input:checked')?.focus()
    const button = trigger.current
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
      button?.focus()
    }
  }, [open])
  function close() {
    setOpen(false)
  }
  function show() {
    setPortal(trigger.current?.closest('.max-root') ?? document.body)
    setSearch('')
    setOpen(true)
  }
  function select(next: string) {
    if (props.disabled) return
    const element = native.current!
    element.value = next
    element.dispatchEvent(new Event('change', { bubbles: true }))
    close()
  }
  return (
    <span className={`select-field ${className ?? ''}`}>
      <select
        {...props}
        ref={native}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        value={current}
        onChange={(event) => {
          if (value === undefined) setLocal(event.target.value)
          onChange?.(event)
        }}
      >
        {children}
      </select>
      <Button
        ref={trigger}
        id={id}
        type="button"
        variant="secondary"
        className="select-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        aria-invalid={props['aria-invalid']}
        aria-describedby={props['aria-describedby']}
        disabled={props.disabled}
        iconAfter={<ChevronDown size={17} aria-hidden="true" />}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            show()
          }
        }}
      >
        {options.find((option) => option.value === current)?.label ?? 'Выберите вариант'}
      </Button>
      {open &&
        portal &&
        createPortal(
          <dialog
            ref={dialog}
            id={dialogId}
            className="select-dialog"
            aria-labelledby={titleId}
            onCancel={(event) => {
              event.preventDefault()
              event.stopPropagation()
              close()
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                const r = event.currentTarget.getBoundingClientRect()
                if (
                  event.clientX < r.left ||
                  event.clientX > r.right ||
                  event.clientY < r.top ||
                  event.clientY > r.bottom
                )
                  close()
              }
            }}
          >
            <div className="select-dialog-heading">
              <h2 id={titleId}>{label}</h2>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Закрыть выбор: ${label}`}
                onClick={close}
              >
                <X size={20} />
              </Button>
            </div>
            {options.length > 7 && (
              <Input
                aria-label={`Поиск: ${label}`}
                placeholder="Найти вариант"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
            <div className="select-options" role="radiogroup" aria-label={label}>
              {visible.map((option) => (
                <label
                  key={option.value}
                  className={`select-option ${option.value === current ? 'selected' : ''}`}
                >
                  <Radio
                    name={`${uid}-option`}
                    value={option.value}
                    checked={current === option.value}
                    disabled={option.disabled}
                    onClick={() => {
                      if (current === option.value) close()
                    }}
                    onChange={() => select(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
              {!visible.length && (
                <p className="select-empty" role="status">
                  Ничего не найдено. Измените запрос.
                </p>
              )}
            </div>
          </dialog>,
          portal,
        )}
    </span>
  )
}
