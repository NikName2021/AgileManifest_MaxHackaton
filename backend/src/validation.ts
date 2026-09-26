import { z } from 'zod';
import { buildVacancyCardText, MAX_CARD_TEXT_LIMIT } from './vacancies/cardText.js';

// Общие zod-схемы для REST API (раздел 6 ТЗ) — раньше валидация была ручной ("if (!body?.x)"),
// пропускала неверные типы (например строку вместо числа в salary_min) и не давала внятных
// сообщений об ошибке. safeParse ниже используется в server.ts для каждого мутирующего эндпоинта.

export const SCHEDULE_ENUM = z.enum(['seasonal', 'temporary', 'permanent']);

// Верхняя граница — INT4 в Postgres (см. schema.prisma, salary_min/salary_max — Int), а не просто
// "положительное число": значение больше 2 147 483 647 роняло бы запрос на уровне Prisma/БД с
// сырой ошибкой вместо понятного 400 (пункт 5 фидбека фронтенда).
const POSTGRES_INT4_MAX = 2147483647;

// salary_min/salary_max проверяются отдельно (nonnegative) и совместно (min <= max) — раньше
// соотношение между ними вообще не проверялось, можно было создать вакансию с min > max.
const vacancyBaseShape = {
  title: z.string().trim().min(1, 'title is required').max(200),
  region_code: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  schedule: SCHEDULE_ENUM.optional(),
  salary_min: z.coerce.number().int().nonnegative().max(POSTGRES_INT4_MAX).nullable().optional(),
  salary_max: z.coerce.number().int().nonnegative().max(POSTGRES_INT4_MAX).nullable().optional(),
  // Лимит согласован с картой вакансии (см. vacancies/cardText.ts) — это независимый от лимита
  // на весь текст карточки предохранитель на само поле, полная длина карточки после сборки всех
  // полей и экранирования проверяется отдельно (checkCardLength ниже и server.ts для PATCH).
  description: z.string().trim().max(4000).nullable().optional(),
  contact_info: z.string().trim().max(300).nullable().optional(),
};

function checkSalaryRange<T extends { salary_min?: number | null; salary_max?: number | null }>(
  data: T,
  ctx: z.RefinementCtx
) {
  if (
    data.salary_min !== undefined &&
    data.salary_min !== null &&
    data.salary_max !== undefined &&
    data.salary_max !== null &&
    data.salary_min > data.salary_max
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'salary_min must be less than or equal to salary_max',
      path: ['salary_min'],
    });
  }
}

// Раньше длину проверяло только поле description (max 4000) — но итоговая карточка это
// title+region+schedule+salary+description+contact ПОСЛЕ markdown-экранирования, и могла
// превысить лимит MAX (4000 символов на сообщение) даже при валидном по отдельности description
// (раздел 4 фидбека фронтенда). Проверяем это только при создании (тут есть все поля сразу) —
// для PATCH такая же проверка идёт в server.ts после слияния с уже сохранённой записью.
function checkCardLength(data: {
  title: string;
  region_code?: string;
  schedule?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  description?: string | null;
  contact_info?: string | null;
}, ctx: z.RefinementCtx) {
  const length = buildVacancyCardText({
    title: data.title,
    regionCode: data.region_code ?? '',
    schedule: data.schedule ?? 'temporary',
    salaryMin: data.salary_min,
    salaryMax: data.salary_max,
    description: data.description,
    contactInfo: data.contact_info,
  }).length;
  if (length > MAX_CARD_TEXT_LIMIT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `resulting vacancy card text is ${length} characters, exceeds MAX limit of ${MAX_CARD_TEXT_LIMIT}; shorten description or contact_info`,
      path: ['description'],
    });
  }
}

export const createVacancySchema = z
  .object(vacancyBaseShape)
  .superRefine(checkSalaryRange)
  .superRefine(checkCardLength);

// Редактирование черновика (раздел 3.1 хендоффа) — все поля необязательны, но хотя бы одно
// должно присутствовать, иначе PATCH с пустым телом ничего не делает и это стоит явно отклонить.
// Проверка salary_min<=salary_max и длины карточки здесь НЕ делается (partial — нет доступа к уже
// сохранённым значениям других полей), это выполняется в server.ts после слияния с текущей записью.
export const updateVacancySchema = z
  .object(vacancyBaseShape)
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'at least one field is required' });

export const createApplicationSchema = z.object({
  vacancy_id: z.coerce.number().int().positive('vacancy_id is required'),
  contact: z.string().trim().max(200).nullable().optional(),
});

export const APPLICATION_STATUS_ENUM = z.enum(['new', 'contacted', 'invited', 'hired', 'rejected']);

export const updateApplicationStatusSchema = z.object({
  status: APPLICATION_STATUS_ENUM,
});

export const authMaxSchema = z.object({
  init_data: z.string().min(1, 'init_data is required'),
});

// GET /api/applications (раздел 3.2 хендоффа) — общий список откликов по всем вакансиям
// работодателя, с пагинацией и опциональным фильтром по статусу.
export const listApplicationsQuerySchema = z.object({
  status: APPLICATION_STATUS_ENUM.optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

// Утилита для PATCH /api/vacancies/:id (server.ts) — проверка salary_min<=salary_max и длины
// карточки ПОСЛЕ слияния уже сохранённых полей с частичным телом запроса. Отдельно от zod-схем
// выше, потому что partial-схема не видит остальные поля записи.
export function checkMergedVacancyConstraints(merged: {
  title: string;
  region_code?: string | null;
  schedule?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  description?: string | null;
  contact_info?: string | null;
}): { ok: true } | { ok: false; field: string; message: string } {
  if (
    merged.salary_min !== null &&
    merged.salary_min !== undefined &&
    merged.salary_max !== null &&
    merged.salary_max !== undefined &&
    merged.salary_min > merged.salary_max
  ) {
    return { ok: false, field: 'salary_min', message: 'salary_min must be less than or equal to salary_max' };
  }

  const length = buildVacancyCardText({
    title: merged.title,
    regionCode: merged.region_code ?? '',
    schedule: merged.schedule ?? 'temporary',
    salaryMin: merged.salary_min,
    salaryMax: merged.salary_max,
    description: merged.description,
    contactInfo: merged.contact_info,
  }).length;
  if (length > MAX_CARD_TEXT_LIMIT) {
    return {
      ok: false,
      field: 'description',
      message: `resulting vacancy card text is ${length} characters, exceeds MAX limit of ${MAX_CARD_TEXT_LIMIT}; shorten description or contact_info`,
    };
  }

  return { ok: true };
}
