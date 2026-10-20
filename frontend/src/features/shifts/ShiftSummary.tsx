import type { Shift } from './model'

export function ShiftSummary({ shift, worker = false }: { shift: Shift; worker?: boolean }) {
  if (!shift.startAt) return null
  return <div className="shift-summary">
    <strong>Выход: {new Date(shift.startAt).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short',
    })} МСК</strong>
    <span>{shift.attendance === 'confirmed' ? 'Выход подтверждён' :
      shift.attendance === 'declined' ? 'Не сможет выйти' : 'Ждём подтверждения'}</span>
    {shift.shiftNote && <p>{shift.shiftNote}</p>}
    {worker && shift.attendance === 'pending' && <p>Подтвердите выход или сообщите об отказе кнопкой в сообщении бота MAX.</p>}
  </div>
}
