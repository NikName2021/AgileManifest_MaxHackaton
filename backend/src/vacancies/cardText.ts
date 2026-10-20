import { escapeMarkdown } from '../markdown.js';
import { getBotUsername } from '../max/botInfo.js';

// Лимит MAX на текст сообщения — считается по итоговому тексту после экранирования.
export const MAX_CARD_TEXT_LIMIT = 4000;

export interface VacancyCardFields {
  title: string;
  regionCode: string;
  schedule: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  contactInfo: string | null;
  // Сколько человек нужно; null — не указано.
  headcount?: number | null;
}

// 0 — реальная сумма, поэтому сравнение с null, а не truthy-проверка.
export function formatSalary(min: number | null, max: number | null): string {
  const hasMin = min !== null;
  const hasMax = max !== null;
  if (hasMin && hasMax) return `${min}–${max} ₽`;
  if (hasMin) return `от ${min} ₽`;
  if (hasMax) return `до ${max} ₽`;
  return 'по договорённости';
}

const SCHEDULE_LABELS: Record<string, string> = {
  seasonal: 'сезонная',
  temporary: 'временная',
  permanent: 'постоянная',
};

export function scheduleLabel(schedule: string): string {
  return SCHEDULE_LABELS[schedule] ?? schedule;
}

// Неожиданное значение из GET /me или MAX_BOT_USERNAME не должно дать битый URL.
const BOT_USERNAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;

// Резерв под ссылку, пока ID вакансии или username неизвестны: максимальные длины.
const RESERVED_USERNAME = 'x'.repeat(64);
const RESERVED_VACANCY_ID = 2147483647;

// Deep link отклика для текста карточки, link-кнопки и applyUrl в API. Формат —
// dev.max.ru/help/deeplinks, payload apply_<id> разбирает webhook.ts. null — username неизвестен.
// Метка в payload (apply_<id>_<метка>) показывает, откуда пришёл отклик.
export type LinkSource = 'qr' | 'sub' | 'ch';

export function buildApplyDeepLink(
  vacancyId: number,
  botUsername: string | undefined = getBotUsername(),
  source?: LinkSource
): string | null {
  if (!botUsername || !BOT_USERNAME_RE.test(botUsername)) return null;
  return `https://max.ru/${botUsername}?start=apply_${vacancyId}${source ? `_${source}` : ''}`;
}

function applyLinkBlock(applyUrl: string): string {
  // MAX теряет inline-кнопки при пересылке, поэтому ссылка дублируется в тексте.
  // Видимый текст экранируется (иначе "_" съест разметка), сам URL — нет.
  return `Откликнуться:\n[${escapeMarkdown(applyUrl)}](${applyUrl})`;
}

// Одна сборка и для отправки, и для проверки длины — чтобы они не разошлись.
export function buildVacancyCardText(vacancy: VacancyCardFields, applyUrl: string | null = null): string {
  const salaryText = formatSalary(vacancy.salaryMin, vacancy.salaryMax);

  return [
    `**${escapeMarkdown(vacancy.title)}**`,
    `Регион: ${escapeMarkdown(vacancy.regionCode)}`,
    `График: ${escapeMarkdown(scheduleLabel(vacancy.schedule))}`,
    `Зарплата: ${salaryText}`,
    vacancy.headcount ? `Нужно человек: ${vacancy.headcount}` : undefined,
    vacancy.description ? escapeMarkdown(vacancy.description) : undefined,
    vacancy.contactInfo ? `Контакт: ${escapeMarkdown(vacancy.contactInfo)}` : undefined,
    applyUrl ? applyLinkBlock(applyUrl) : undefined,
  ].filter(Boolean).join('\n');
}

// Для проверок до отправки — с худшим случаем ссылки, чтобы прошедшая валидацию карточка точно влезла.
export function vacancyCardTextLength(vacancy: VacancyCardFields): number {
  const reservedUrl = buildApplyDeepLink(RESERVED_VACANCY_ID, getBotUsername() ?? RESERVED_USERNAME)
    ?? buildApplyDeepLink(RESERVED_VACANCY_ID, RESERVED_USERNAME)!;
  return buildVacancyCardText(vacancy, reservedUrl).length;
}
