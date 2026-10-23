import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@maxhub/max-ui'
import { useResourceClient } from '../api/useResource'

export function PageRefresh() {
  const client = useResourceClient()
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
      }
    }
  }, [client])

  useEffect(() => {
    return () => {
      generation.current += 1
    }
  }, [])

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
      {busy && (
        <div className="page-refresh-indicator" role="status" aria-live="polite">
          <RefreshCw size={20} className="refresh-spinning" aria-hidden="true" />
          <span>Обновляем…</span>
        </div>
      )}
      <span className="refresh-feedback" role="status">
        {message}
      </span>
    </div>
  )
}
