import { escapeMarkdown } from '../markdown.js';
import { getBotUsername } from '../max/botInfo.js';
import { badgesLine, resolveBadges } from './badges.js';

// Лимит MAX на текст сообщения — считается по итоговому тексту после экранирования.
export const MAX_CARD_TEXT_LIMIT = 4000;

export interface VacancyCardFields {
  title: string;
  regionCode: string;
  schedule: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  // Сколько человек нужно; null — не указано.
  headcount?: number | null;
  studentFriendly?: boolean;
  // Ключи бейджей (vacancies/badges.ts).
  badges?: string[];
  // Отметка «Надёжный работодатель» (employers/trust.ts) на момент сборки карточки.
  trustedEmployer?: boolean;
}

export const TRUSTED_LINE = '✓ Надёжный работодатель';
export const STUDENTS_LINE = '🎓 Подходит студентам';

const RUB = new Intl.NumberFormat('ru-RU');

// Суммы с разделением разрядов ru-RU; равные границы — одна сумма. 0 — реальная сумма, поэтому
// сравнение с null, а не truthy-проверка.
export function formatSalary(min: number | null, max: number | null): string {
  const hasMin = min !== null;
  const hasMax = max !== null;
  if (hasMin && hasMax) return min === max ? `${RUB.format(min)} ₽` : `${RUB.format(min)}–${RUB.format(max)} ₽`;
  if (hasMin) return `от ${RUB.format(min)} ₽`;
  if (hasMax) return `до ${RUB.format(max)} ₽`;
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

// Полное название занятости для карточки: «Сезонная работа».
export function employmentLabel(schedule: string): string {
  const label = SCHEDULE_LABELS[schedule];
  return label ? `${label[0].toUpperCase()}${label.slice(1)} работа` : schedule;
}

// 1 человек, 2 человека, 5 человек, 12 человек, 22 человека.
export function peopleCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'человека' : 'человек';
  return `${n} ${word}`;
}

// Неожиданное значение из GET /me или MAX_BOT_USERNAME не должно дать битый URL.
const BOT_USERNAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;

// Резерв под ссылку, пока ID вакансии или username неизвестны: максимальные длины.
const RESERVED_USERNAME = 'x'.repeat(64);
const RESERVED_VACANCY_ID = 2147483647;
const RESERVED_SOURCE = `ch${RESERVED_VACANCY_ID}` as const;

// Deep link отклика для текста карточки, link-кнопки и applyUrl в API. Формат —
// dev.max.ru/help/deeplinks, payload apply_<id> разбирает webhook.ts. null — username неизвестен.
// Метка в payload (apply_<id>_<метка>) показывает, откуда пришёл отклик; у канала партнёра к метке
// добавляется его номер (apply_<id>_ch<channelId>) — для статистики канала.
export type LinkSource = 'qr' | 'sub' | 'ch' | `ch${number}`;

export function buildApplyDeepLink(
  vacancyId: number,
  botUsername: string | undefined = getBotUsername(),
  source?: LinkSource
): string | null {
  if (!botUsername || !BOT_USERNAME_RE.test(botUsername)) return null;
  return `https://max.ru/${botUsername}?start=apply_${vacancyId}${source ? `_${source}` : ''}`;
}

// MAX теряет inline-кнопки при пересылке, поэтому ссылка дублируется в тексте — короткой подписью
// вместо длинного URL.
export const APPLY_LINK_LABEL = 'Ссылка для отклика';

// Блоки карточки разделяются одной пустой строкой; пустые строки и блоки не выводятся.
function joinBlocks(blocks: (string | undefined)[][]): string {
  return blocks
    .map((lines) => lines.filter((line): line is string => Boolean(line)).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

// Одна сборка и для отправки, и для проверки длины — чтобы они не разошлись.
// Блоки: заголовок и отметка надёжности → оплата и условия → бейджи → описание → ссылка.
export function buildVacancyCardText(vacancy: VacancyCardFields, applyUrl: string | null = null): string {
  const place = [vacancy.regionCode || undefined, employmentLabel(vacancy.schedule)].filter(Boolean).join(' · ');
  const badges = badgesLine(resolveBadges(vacancy.badges));

  return joinBlocks([
    [`**${escapeMarkdown(vacancy.title)}**`, vacancy.trustedEmployer ? TRUSTED_LINE : undefined],
    [
      `**${escapeMarkdown(capitalize(formatSalary(vacancy.salaryMin, vacancy.salaryMax)))}**`,
      escapeMarkdown(place),
      // Общая квота набора, а не остаток свободных мест.
      vacancy.headcount ? `Набор: ${peopleCount(vacancy.headcount)}` : undefined,
      // Отдельная отметка, не бейдж: по ней фильтруют каталог, подписки и каналы вузов.
      vacancy.studentFriendly ? STUDENTS_LINE : undefined,
    ],
    [badges ? escapeMarkdown(badges) : undefined],
    [vacancy.description ? escapeMarkdown(vacancy.description) : undefined],
    // Контакт работодателя в публичную карточку не попадает: кандидат видит его после приглашения.
    [applyUrl ? `[${APPLY_LINK_LABEL}](${applyUrl})` : undefined],
  ]);
}

// Для проверок до отправки — с худшим случаем ссылки, чтобы прошедшая валидацию карточка точно влезла.
export function vacancyCardTextLength(vacancy: VacancyCardFields): number {
  const reservedUrl = buildApplyDeepLink(RESERVED_VACANCY_ID, getBotUsername() ?? RESERVED_USERNAME, RESERVED_SOURCE)
    ?? buildApplyDeepLink(RESERVED_VACANCY_ID, RESERVED_USERNAME, RESERVED_SOURCE)!;
  // Отметка может появиться к моменту публикации — место под неё резервируется всегда.
  return buildVacancyCardText({ ...vacancy, trustedEmployer: true }, reservedUrl).length;
}
