import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowDown, RefreshCw } from 'lucide-react'
import { Button } from '@maxhub/max-ui'
import { useResourceClient } from '../api/useResource'

const threshold = 64

export function PullToRefresh({ target }: { target: RefObject<HTMLElement | null> }) {
  const client = useResourceClient()
  const [distance, setDistance] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const control = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    if (lock.current) return
    if (control.current?.closest('main')?.querySelector('[data-refresh-lock="true"]')) {
      setMessage('Сохраните изменения перед обновлением данных.')
      return
    }
    lock.current = true
    const current = generation.current
    setBusy(true)
    setMessage('')
    try {
      // Only resources on the visible screen, including its navigation counts.
      await client.refetchQueries({ type: 'active' }, { cancelRefetch: false, throwOnError: true })
      if (generation.current === current) setMessage('Данные обновлены')
    } catch {
      if (generation.current === current)
        setMessage('Не удалось обновить данные. Проверьте подключение и повторите.')
    } finally {
      if (generation.current === current) {
        lock.current = false
        setBusy(false)
        setDistance(0)
      }
    }
  }, [client])

  useEffect(() => {
    const revision = generation.current
    const element = target.current
    if (!element) return
    let start: { x: number; y: number } | null = null
    let offset = 0
    function reset() {
      start = null
      offset = 0
      setDistance(0)
    }
    function touchStart(event: TouchEvent) {
      start = null
      offset = 0
      if (
        lock.current ||
        event.touches.length !== 1 ||
        window.scrollY > 0 ||
        document.querySelector('dialog[open]')
      )
        return
      const node = event.target instanceof Element ? event.target : null
      if (
        node?.closest(
          'input, textarea, select, button, a, [contenteditable="true"], [role="slider"]',
        )
      )
        return
      // Leave scrolling inside text areas, cards and pickers to the browser.
      for (let parent = node; parent && parent !== element; parent = parent.parentElement) {
        if (
          parent.scrollHeight > parent.clientHeight &&
          /(auto|scroll)/.test(getComputedStyle(parent).overflowY)
        )
          return
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    }
    function touchMove(event: TouchEvent) {
      if (!start || lock.current) return
      if (event.touches.length !== 1 || window.scrollY > 0) {
        reset()
        return
      }
      const dx = event.touches[0].clientX - start.x
      const dy = event.touches[0].clientY - start.y
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
        reset()
        return
      }
      if (dy < 10) return
      if (event.cancelable) event.preventDefault()
      offset = Math.min(96, dy * 0.45)
      setDistance(offset)
    }
    function touchEnd() {
      const ready = offset >= threshold
      reset()
      if (ready) void refresh()
    }
    element.addEventListener('touchstart', touchStart, { passive: true })
    element.addEventListener('touchmove', touchMove, { passive: false })
    element.addEventListener('touchend', touchEnd)
    element.addEventListener('touchcancel', reset)
    return () => {
      generation.current = revision + 1
      element.removeEventListener('touchstart', touchStart)
      element.removeEventListener('touchmove', touchMove)
      element.removeEventListener('touchend', touchEnd)
      element.removeEventListener('touchcancel', reset)
    }
  }, [target, refresh])

  return (
    <div className="page-refresh" ref={control}>
      <Button
        type="button"
        variant="ghost"
        className="refresh-button"
        aria-label="Обновить данные"
        title="Обновить данные"
        disabled={busy}
        onClick={() => void refresh()}
      >
        <RefreshCw size={18} className={busy ? 'refresh-spinning' : undefined} aria-hidden="true" />
      </Button>
      <div
        className={`pull-refresh-indicator${busy || distance > 0 ? ' visible' : ''}`}
        style={{ transform: `translate(-50%, ${busy ? 24 : distance / 2}px)` }}
        role="status"
        aria-live="polite"
      >
        {busy ? (
          <RefreshCw size={20} className="refresh-spinning" aria-hidden="true" />
        ) : (
          <ArrowDown size={20} aria-hidden="true" />
        )}
        <span>
          {busy
            ? 'Обновляем…'
            : distance >= threshold
              ? 'Отпустите для обновления'
              : 'Потяните вниз для обновления'}
        </span>
      </div>
      <span className="refresh-feedback" role="status">
        {message}
      </span>
    </div>
  )
}
