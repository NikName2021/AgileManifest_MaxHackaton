import { Button } from '@maxhub/max-ui'
import { CheckCircle2, X } from 'lucide-react'

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
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
