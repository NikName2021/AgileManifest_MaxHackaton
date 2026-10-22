import { Button } from '@maxhub/max-ui'
import { CheckCircle2, X } from 'lucide-react'
import { useEffect } from 'react'

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4500)
    return () => window.clearTimeout(timer)
  }, [message, onClose])
  return (
    <div className="app-toast" role="status">
      <CheckCircle2 size={20} aria-hidden="true" />
      <span>{message}</span>
      <Button type="button" variant="ghost" aria-label="Закрыть уведомление" onClick={onClose}>
        <X size={18} />
      </Button>
    </div>
  )
}
