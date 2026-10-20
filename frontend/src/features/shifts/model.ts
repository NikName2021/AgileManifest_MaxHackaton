import { ApiError } from '../../shared/api/client'

export interface Shift {
  startAt?: string | null
  shiftNote?: string | null
  attendance?: 'pending' | 'confirmed' | 'declined' | null
}
export function parseShift(value: Record<string, unknown>): Shift {
  const { startAt, shiftNote, attendance } = value
  if (
    (startAt != null && (typeof startAt !== 'string' || !Number.isFinite(Date.parse(startAt)))) ||
    (shiftNote != null && typeof shiftNote !== 'string') ||
    (attendance != null && !['pending', 'confirmed', 'declined'].includes(String(attendance)))
  )
    throw new ApiError('contract')
  return {
    startAt: startAt as Shift['startAt'],
    shiftNote: shiftNote as Shift['shiftNote'],
    attendance: attendance as Shift['attendance'],
  }
}
export function shiftInput(iso?: string | null) {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const part = (type: string) => parts.find((p) => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
export function shiftDate(input: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw new Error('Укажите дату и время.')
  const time = Date.parse(`${input}:00+03:00`)
  if (!Number.isFinite(time) || shiftInput(new Date(time).toISOString()) !== input || time <= now)
    throw new Error('Укажите будущую дату и время по Москве.')
  return new Date(time).toISOString()
}
