import { ApiError } from './client'
export function fieldError(error: unknown, field: string) {
  if (!(error instanceof ApiError) || !error.fields.includes(field)) return undefined
  const message = error.fieldMessages[field]?.join(' ') || ''
  if (/must not contain/i.test(message))
    return 'Уберите ссылку / номер телефона / e-mail / @ник — контакт указывается в отдельном поле'
  if (/4000/.test(message)) return 'Карточка не помещается в сообщение MAX — сократите описание'
  if (/letters or digits/.test(message)) return 'Напишите словами'
  if (field === 'contact_info')
    return 'Укажите телефон, @ник, e-mail или ссылку на MAX / Telegram — до 3 через запятую'
  if (field === 'badges') return 'Не больше 10 бейджей вместе с «Подходит студентам»'
  if (field === 'category' || field === 'categories') return 'Выберите сферу из списка или «Другое»'
  if (field === 'company_name') return 'До 120 символов, без ссылок и контактов'
  return 'Проверьте значение этого поля.'
}
