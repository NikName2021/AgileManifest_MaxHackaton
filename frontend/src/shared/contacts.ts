// Frontend contact policy; the expected API contract is documented in backend-integration-requirements.md.
export const CONTACT_HINT = 'Укажите телефон, @ник в MAX или ссылку на max.ru.'
const CONTACT_LINK_HOSTS = ['max.ru', 'web.max.ru']
const MAX_CONTACTS_PER_FIELD = 3

const HANDLE = /^@[A-Za-z][A-Za-z0-9_.]{2,31}$/
const LINK = /^(?:https?:\/\/)?([A-Za-z0-9.-]+)(\/[^\s]+)$/i

// Российский номер: +7/8/7 и 10 цифр, код начинается с 3–9 (000 и 1xx не бывает). Иностранный —
// только с «+», 11–15 цифр. Возвращает единый вид или null.
export function normalizePhone(raw: string): string | null {
  const value = raw.trim()
  if (!/^\+?[\d\s\-().]+$/.test(value)) return null
  const digits = value.replace(/\D/g, '')
  const plus = value.startsWith('+')
  let national: string | null = null
  if (digits.length === 11 && (digits[0] === '7' || (digits[0] === '8' && !plus)))
    national = digits.slice(1)
  else if (digits.length === 10 && !plus) national = digits
  if (national !== null) {
    if (!/^[3-9]/.test(national) || /^(\d)\1{9}$/.test(national)) return null
    return `+7 ${national.slice(0, 3)} ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8)}`
  }
  if (plus && digits.length >= 11 && digits.length <= 15 && /^[1-69]/.test(digits))
    return `+${digits}`
  return null
}

// Один контакт: нормализованное значение или null, если это не контакт.
export function normalizeContact(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const phone = normalizePhone(value)
  if (phone) return phone
  if (HANDLE.test(value)) return value
  const link = LINK.exec(value)
  if (link && CONTACT_LINK_HOSTS.includes(link[1].toLowerCase()))
    return `https://${link[1].toLowerCase()}${link[2]}`
  return null
}

// До MAX_CONTACTS_PER_FIELD контактов через запятую, точку с запятой или «или».
export function normalizeContactList(raw: string): string | null {
  const parts = raw.split(/\s*[,;]\s*|\s+или\s+/i).filter((p) => p.trim() !== '')
  if (parts.length === 0 || parts.length > MAX_CONTACTS_PER_FIELD) return null
  const contacts = parts.map(normalizeContact)
  if (contacts.some((c) => c === null)) return null
  return [...new Set(contacts)].join(', ')
}
