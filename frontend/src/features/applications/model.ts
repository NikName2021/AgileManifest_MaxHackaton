import { applicationLabels, type Application, type ApplicationStatus } from '../../entities/hiring'
import { ApiError } from '../../shared/api/client'
import type { StatusResult } from './api'

export function candidateName(application: Application) {
  return application.candidate.displayName?.trim() || `Кандидат № ${application.candidateUserId}`
}
export function candidateContact(application: Application) {
  return application.contact?.trim() || application.candidate.phone?.trim() || ''
}
export function notificationExpected(status: ApplicationStatus) {
  return status === 'invited' || status === 'hired' || status === 'rejected'
}
export interface StatusNotice {
  tone: 'success' | 'warning' | 'neutral'
  text: string
}
export function statusNotice(result: StatusResult, demo: boolean): StatusNotice {
  if (result.unchanged)
    return {
      tone: 'neutral',
      text: 'Этот статус уже установлен. Повторное уведомление не отправлялось.',
    }
  const saved = `Статус «${applicationLabels[result.application.status]}» сохранён.`
  if (demo) return { tone: 'success', text: `${saved} Это демо: сообщения в MAX не отправляются.` }
  if (result.notified) return { tone: 'success', text: `${saved} Уведомление отправлено в MAX.` }
  if (notificationExpected(result.application.status))
    return {
      tone: 'warning',
      text: `${saved} Уведомление не отправлено. Пожалуйста, сообщите кандидату лично.`,
    }
  return {
    tone: 'success',
    text: `${saved} Для этого этапа автоматическое уведомление не отправляется.`,
  }
}
export function applicationError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Не удалось выполнить запрос. Попробуйте позже.'
  if (error.kind === 'unauthorized') return 'Сессия завершилась. Откройте приложение заново из MAX.'
  if (error.kind === 'forbidden') return 'Нет доступа к этим откликам. Выберите свою вакансию.'
  if (error.status === 404) return 'Отклик или вакансия больше не найдены. Обновите список.'
  if (error.status === 409) return 'Данные уже изменились. Проверьте актуальный статус отклика.'
  if (error.code === 'validation_error')
    return 'Сервис не принял выбранный статус. Обновите данные.'
  if (error.kind === 'network') return 'Сервис не отвечает. Проверьте интернет и обновите данные.'
  if (error.kind === 'contract')
    return 'Сервис вернул неожиданный ответ. Не удалось подтвердить данные откликов.'
  return 'Сервис временно недоступен. Попробуйте позже.'
}
export function parsePositiveInteger(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}
