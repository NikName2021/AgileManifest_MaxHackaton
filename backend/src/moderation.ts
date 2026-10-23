// Модерация пользовательского текста — общая для REST (validation.ts) и диалога бота.
// Контакт — это только телефон, @ник, e-mail или ссылка на мессенджер из белого списка. Во всех
// остальных полях (название, описание, регион…) ссылки, телефоны, почта и @ники запрещены: контакт
// работодателя открывается кандидату только после приглашения, и обходить это через описание нельзя.

// Ссылки в контактах — только на MAX. Сервис работает в MAX, поэтому связь ведём туда же: кроме
// ссылки MAX контактом может быть только телефон, @ник в MAX или e-mail.
export const CONTACT_LINK_HOSTS = ['max.ru', 'web.max.ru'];
// Сколько контактов можно указать в одном поле контакта вакансии (через запятую).
export const MAX_CONTACTS_PER_FIELD = 3;

export const CONTACT_FORMAT_HINT = 'телефон (+7 900 123-45-67), @ник в MAX, e-mail или ссылка на профиль в MAX';

const HANDLE = /^@[A-Za-z][A-Za-z0-9_.]{2,31}$/;
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const LINK = /^(?:https?:\/\/)?([A-Za-z0-9.-]+)(\/[^\s]+)$/i;

// Российский номер: +7/8/7 и 10 цифр, код начинается с 3–9 (000 и 1xx не бывает). Иностранный —
// только с «+», 11–15 цифр. Возвращает единый вид или null.
export function normalizePhone(raw: string): string | null {
  const value = raw.trim();
  if (!/^\+?[\d\s\-().]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  const plus = value.startsWith('+');
  let national: string | null = null;
  if (digits.length === 11 && (digits[0] === '7' || (digits[0] === '8' && !plus))) national = digits.slice(1);
  else if (digits.length === 10 && !plus) national = digits;
  if (national !== null) {
    if (!/^[3-9]/.test(national) || /^(\d)\1{9}$/.test(national)) return null;
    return `+7 ${national.slice(0, 3)} ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8)}`;
  }
  if (plus && digits.length >= 11 && digits.length <= 15 && /^[1-69]/.test(digits)) return `+${digits}`;
  return null;
}

// Один контакт: нормализованное значение или null, если это не контакт.
export function normalizeContact(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const phone = normalizePhone(value);
  if (phone) return phone;
  if (HANDLE.test(value)) return value;
  if (EMAIL.test(value)) return value.toLowerCase();
  const link = LINK.exec(value);
  if (link && CONTACT_LINK_HOSTS.includes(link[1].toLowerCase())) return `https://${link[1].toLowerCase()}${link[2]}`;
  return null;
}

// До MAX_CONTACTS_PER_FIELD контактов через запятую, точку с запятой или «или».
export function normalizeContactList(raw: string): string | null {
  const parts = raw.split(/\s*[,;]\s*|\s+или\s+/i).filter((p) => p.trim() !== '');
  if (parts.length === 0 || parts.length > MAX_CONTACTS_PER_FIELD) return null;
  const contacts = parts.map(normalizeContact);
  if (contacts.some((c) => c === null)) return null;
  return [...new Set(contacts)].join(', ');
}

const TLD = 'ru|рф|su|рус|com|net|org|info|biz|pro|me|io|co|app|dev|online|site|store|shop|club|xyz|top|link|ly|gg|cc|tv|by|kz|ua|uz|am|ge|de|uk|us|eu';
const CONTACT_LIKE: { kind: ContactLikeKind; re: RegExp }[] = [
  { kind: 'email', re: /[^\s@]+@[^\s@]+\.[\p{L}]{2,}/u },
  { kind: 'handle', re: /(?:^|[^\p{L}\p{N}_])@[A-Za-z0-9_.]{3,}/u },
  { kind: 'link', re: /https?:\/\/|www\./i },
  { kind: 'link', re: new RegExp(`(?:^|[^\\p{L}\\p{N}@.-])[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:${TLD})(?![\\p{L}\\p{N}])`, 'iu') },
  // +7/8 и 10 цифр с любыми разделителями: «8 (900) 123-45-67», «+7 900 1234567».
  { kind: 'phone', re: /(?:\+7|(?<!\d)[78])[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)/ },
  { kind: 'phone', re: /\+\d[\d\s\-()]{8,}\d/ },
  { kind: 'phone', re: /(?<!\d)\d{10,}(?!\d)/ },
];

export type ContactLikeKind = 'link' | 'phone' | 'email' | 'handle';

// Есть ли в свободном тексте ссылка, телефон, почта или @ник.
export function findContactLike(text: string): ContactLikeKind | null {
  for (const { kind, re } of CONTACT_LIKE) if (re.test(text)) return kind;
  return null;
}

const CONTACT_LIKE_RU: Record<ContactLikeKind, string> = {
  link: 'ссылку',
  phone: 'номер телефона',
  email: 'e-mail',
  handle: '@ник',
};

export function contactLikeErrorRu(kind: ContactLikeKind): string {
  return `Уберите ${CONTACT_LIKE_RU[kind]}: ссылки и контакты в этом поле запрещены. Контакт указывается отдельно и открывается кандидату после приглашения.`;
}

const MAX_PROFILE_HOSTS = new Set(['max.ru', 'web.max.ru']);

// Ссылка на профиль или диалог в MAX, которую кандидат сам оставил в контакте отклика: только https
// и только max.ru / web.max.ru. Из maxUserId адрес не собирается — правила для этого в MAX нет.
export function maxContactUrl(contact: string | null): string | null {
  if (!contact) return null;
  for (const part of contact.split(/[\s,;]+/)) {
    let url: URL;
    try {
      url = new URL(part);
    } catch {
      continue;
    }
    if (url.protocol === 'https:' && MAX_PROFILE_HOSTS.has(url.hostname) && !url.username && !url.password && url.pathname.length > 1) {
      return url.href;
    }
  }
  return null;
}
