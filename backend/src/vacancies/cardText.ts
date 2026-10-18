import { escapeMarkdown } from '../markdown.js';
import { getBotUsername } from '../max/botInfo.js';

// Лимит документирован MAX (см. README/DATA-API) — 4000 символов на текст сообщения.
// Раньше ограничивалось только поле description (zod, 4000 симв.) — но итоговая карточка
// это title+region+schedule+salary+description+contact ПОСЛЕ экранирования markdown, и могла
// превысить лимит даже при валидном description (раздел 4 фидбека фронтенда).
export const MAX_CARD_TEXT_LIMIT = 4000;

// Поля либо всегда заданы (title/regionCode/schedule), либо явно "число или ничего" /
// "строка или ничего" (`| null`, без `?`) — вызывающая сторона обязана привести отсутствующее
// значение к null сама (`data.salary_min ?? null`), а не оставлять его undefined. Раньше часть
// полей была одновременно optional и nullable (`salaryMin?: number | null`), что дублировало
// один и тот же смысл двумя разными способами без причины.
export interface VacancyCardFields {
  title: string;
  regionCode: string;
  schedule: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  contactInfo: string | null;
}

// Раньше здесь были truthy-проверки (`vacancy.salaryMin && vacancy.salaryMax`) — API разрешает
// 0 как валидную сумму (zod: nonnegative), а `0` truthy-проверкой воспринимался как "нет суммы"
// и карточка молча показывала "по договорённости" вместо реального нуля.
function formatSalary(min: number | null, max: number | null): string {
  const hasMin = min !== null;
  const hasMax = max !== null;
  if (hasMin && hasMax) return `${min}–${max} ₽`;
  if (hasMin) return `от ${min} ₽`;
  if (hasMax) return `до ${max} ₽`;
  return 'по договорённости';
}

// Username бота в ссылке https://max.ru/<username> — проверяем формат до подстановки, чтобы при
// неожиданном значении из GET /me или MAX_BOT_USERNAME не вставить в карточку битый URL.
const BOT_USERNAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;

// Резерв под ссылку, пока username/ID неизвестны (валидация при создании вакансии — ID ещё нет,
// username мог не определиться при старте): максимальная длина username и ID в пределах Postgres Int.
const RESERVED_USERNAME = 'x'.repeat(64);
const RESERVED_VACANCY_ID = 2147483647;

// Общая точка формирования deep link отклика: используется и для текстовой ссылки в карточке,
// и для link-кнопки, и для applyUrl в API. Payload apply_<id> разбирается в max/webhook.ts
// (bot_started). Формат по dev.max.ru/help/deeplinks: https://max.ru/<botName>?start=<payload>,
// payload до 128 символов. null — username неизвестен или некорректен: ссылку не строим вовсе.
export function buildApplyDeepLink(vacancyId: number, botUsername: string | undefined = getBotUsername()): string | null {
  if (!botUsername || !BOT_USERNAME_RE.test(botUsername)) return null;
  return `https://max.ru/${botUsername}?start=apply_${vacancyId}`;
}

function applyLinkBlock(applyUrl: string): string {
  // MAX не переносит inline-кнопки при пересылке сообщения бота в другой чат
  // (dev.max.ru/docs-api/use-cases/sending-messages/keyboard) — поэтому ссылка дублируется в тексте.
  // Видимый текст экранируется (иначе "_" в apply_<id> съедается разметкой), сам URL — нет.
  return `Откликнуться:\n[${escapeMarkdown(applyUrl)}](${applyUrl})`;
}

// Общая сборка текста карточки — используется и для реальной отправки (publish.ts), и для
// серверной проверки длины ДО сохранения/публикации (server.ts, dialog/vacancyFlow.ts), чтобы
// оба места гарантированно считали один и тот же текст, включая экранирование markdown.
// applyUrl — готовая ссылка из buildApplyDeepLink; null — карточка без текстовой ссылки.
export function buildVacancyCardText(vacancy: VacancyCardFields, applyUrl: string | null = null): string {
  const salaryText = formatSalary(vacancy.salaryMin, vacancy.salaryMax);

  return [
    `**${escapeMarkdown(vacancy.title)}**`,
    `Регион: ${escapeMarkdown(vacancy.regionCode)}`,
    `График: ${escapeMarkdown(vacancy.schedule)}`,
    `Зарплата: ${salaryText}`,
    vacancy.description ? escapeMarkdown(vacancy.description) : undefined,
    vacancy.contactInfo ? `Контакт: ${escapeMarkdown(vacancy.contactInfo)}` : undefined,
    applyUrl ? applyLinkBlock(applyUrl) : undefined,
  ].filter(Boolean).join('\n');
}

// Длина карточки для предварительных проверок (создание, PATCH, диалог) — всегда с худшим случаем
// ссылки: максимальный ID и известный username (или резервный максимальной длины, если его пока нет).
// Так вакансия, прошедшая валидацию, гарантированно влезет в лимит и при реальной отправке.
export function vacancyCardTextLength(vacancy: VacancyCardFields): number {
  const reservedUrl = buildApplyDeepLink(RESERVED_VACANCY_ID, getBotUsername() ?? RESERVED_USERNAME)
    ?? buildApplyDeepLink(RESERVED_VACANCY_ID, RESERVED_USERNAME)!;
  return buildVacancyCardText(vacancy, reservedUrl).length;
}
