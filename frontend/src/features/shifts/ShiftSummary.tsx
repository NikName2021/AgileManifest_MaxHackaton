import type { Shift } from './model'
import { CalendarClock, CheckCircle2, Clock3, XCircle } from 'lucide-react'

export function ShiftSummary({ shift, worker = false }: { shift: Shift; worker?: boolean }) {
  if (!shift.startAt)
    return (
      <div className="shift-summary">
        <span className="shift-attendance shift-attendance-unscheduled">
          <CalendarClock size={18} aria-hidden="true" />
          Выход ещё не назначен
        </span>
      </div>
    )
  return (
    <div className="shift-summary">
      <strong>
        Выход:{' '}
        {new Date(shift.startAt).toLocaleString('ru-RU', {
          timeZone: 'Europe/Moscow',
          dateStyle: 'medium',
          timeStyle: 'short',
        })}{' '}
        МСК
      </strong>
      <span className={`shift-attendance shift-attendance-${shift.attendance ?? 'pending'}`}>
        {shift.attendance === 'confirmed' ? (
          <CheckCircle2 size={18} aria-hidden="true" />
        ) : shift.attendance === 'declined' ? (
          <XCircle size={18} aria-hidden="true" />
        ) : (
          <Clock3 size={18} aria-hidden="true" />
        )}
        {shift.attendance === 'confirmed'
          ? 'Выход подтверждён'
          : shift.attendance === 'declined'
            ? 'Не сможет выйти'
            : 'Ждём подтверждения'}
      </span>
      {shift.shiftNote && <p>{shift.shiftNote}</p>}
      {worker && shift.attendance === 'pending' && (
        <p>Подтвердите выход или сообщите об отказе кнопкой в сообщении бота MAX.</p>
      )}
    </div>
  )
}
