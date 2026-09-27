import { escapeMarkdown } from '../markdown.js';

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

// Общая сборка текста карточки — используется и для реальной отправки (publish.ts), и для
// серверной проверки длины ДО сохранения/публикации (server.ts, dialog/vacancyFlow.ts), чтобы
// оба места гарантированно считали один и тот же текст, включая экранирование markdown.
export function buildVacancyCardText(vacancy: VacancyCardFields): string {
  const salaryText = formatSalary(vacancy.salaryMin, vacancy.salaryMax);

  return [
    `**${escapeMarkdown(vacancy.title)}**`,
    `Регион: ${escapeMarkdown(vacancy.regionCode)}`,
    `График: ${escapeMarkdown(vacancy.schedule)}`,
    `Зарплата: ${salaryText}`,
    vacancy.description ? escapeMarkdown(vacancy.description) : undefined,
    vacancy.contactInfo ? `Контакт: ${escapeMarkdown(vacancy.contactInfo)}` : undefined,
  ].filter(Boolean).join('\n');
}

export function vacancyCardTextLength(vacancy: VacancyCardFields): number {
  return buildVacancyCardText(vacancy).length;
}
