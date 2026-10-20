import { z } from 'zod';
import { vacancyCardTextLength, MAX_CARD_TEXT_LIMIT } from './vacancies/cardText.js';

export const SCHEDULE_ENUM = z.enum(['seasonal', 'temporary', 'permanent']);

// Колонки зарплат и id — Postgres INT4: значение больше даёт ошибку БД вместо понятного 400.
const POSTGRES_INT4_MAX = 2147483647;

const vacancyBaseShape = {
  title: z.string().trim().min(1, 'title is required').max(200),
  region_code: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  schedule: SCHEDULE_ENUM.optional(),
  // Без coerce: coerce превращал "" в 0 и true в 1.
  salary_min: z.number().int().nonnegative().max(POSTGRES_INT4_MAX).nullable().optional(),
  salary_max: z.number().int().nonnegative().max(POSTGRES_INT4_MAX).nullable().optional(),
  // Ограничение самого поля; длина всей карточки проверяется отдельно (checkCardLength).
  description: z.string().trim().max(4000).nullable().optional(),
  contact_info: z.string().trim().max(300).nullable().optional(),
  headcount: z.number().int().min(1).max(1000).nullable().optional(),
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

// Лимит MAX — 4000 символов на всё сообщение после экранирования, а не на одно description.
// Для PATCH та же проверка — checkMergedVacancyConstraints после слияния с сохранённой записью.
function checkCardLength(data: {
  title: string;
  region_code?: string;
  schedule?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  description?: string | null;
  contact_info?: string | null;
  headcount?: number | null;
}, ctx: z.RefinementCtx) {
  const length = vacancyCardTextLength({
    title: data.title,
    regionCode: data.region_code ?? '',
    schedule: data.schedule ?? 'temporary',
    salaryMin: data.salary_min ?? null,
    salaryMax: data.salary_max ?? null,
    description: data.description ?? null,
    contactInfo: data.contact_info ?? null,
    headcount: data.headcount ?? null,
  });
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

// Межполевые проверки здесь невозможны (partial не видит сохранённых значений) —
// они в checkMergedVacancyConstraints.
export const updateVacancySchema = z
  .object(vacancyBaseShape)
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'at least one field is required' });

// Телефон, username или ссылка MAX. Тот же лимит применяет бот (application/service.ts).
export const APPLICATION_CONTACT_MAX_LENGTH = 200;

const contactString = (field: string) =>
  z
    .string({ required_error: `${field} is required`, invalid_type_error: `${field} must be a string` })
    .trim()
    .min(1, `${field} must not be empty`)
    .max(APPLICATION_CONTACT_MAX_LENGTH);

export const createApplicationSchema = z.object({
  vacancy_id: z.coerce.number().int().positive('vacancy_id is required').max(POSTGRES_INT4_MAX),
  contact: contactString('contact'),
});

export const APPLICATION_STATUS_ENUM = z.enum(['new', 'contacted', 'invited', 'hired', 'rejected']);

export const updateApplicationStatusSchema = z.object({
  status: APPLICATION_STATUS_ENUM,
});

export const authMaxSchema = z.object({
  init_data: z.string().min(1, 'init_data is required'),
});

export const listApplicationsQuerySchema = z.object({
  status: APPLICATION_STATUS_ENUM.optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

const POSITIVE_INT = z.coerce.number().int().positive();

// Пустой query-параметр (?salary_from=) — «не задан»: coerce дал бы 0 и включил бы фильтр.
const optionalQueryInt = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === '' || v === undefined ? undefined : v), schema.optional());

export const JOB_SORT_ENUM = z.enum(['newest', 'salary_desc']);

export const listJobsQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    region_code: z.string().trim().max(100).optional(),
    category: z.string().trim().max(100).optional(),
    schedule: SCHEDULE_ENUM.optional(),
    salary_from: optionalQueryInt(z.coerce.number().int().nonnegative().max(POSTGRES_INT4_MAX)),
    salary_to: optionalQueryInt(z.coerce.number().int().nonnegative().max(POSTGRES_INT4_MAX)),
    sort: JOB_SORT_ENUM.optional().default('newest'),
    limit: optionalQueryInt(z.coerce.number().int().min(1).max(100)).default(20),
    offset: optionalQueryInt(z.coerce.number().int().nonnegative().max(POSTGRES_INT4_MAX)).default(0),
  })
  .superRefine((data, ctx) => {
    if (data.salary_from !== undefined && data.salary_to !== undefined && data.salary_from > data.salary_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'salary_from must be less than or equal to salary_to',
        path: ['salary_from'],
      });
    }
  });

export const listMyApplicationsQuerySchema = z.object({
  status: APPLICATION_STATUS_ENUM.optional(),
  limit: optionalQueryInt(z.coerce.number().int().min(1).max(100)).default(20),
  offset: optionalQueryInt(z.coerce.number().int().nonnegative().max(POSTGRES_INT4_MAX)).default(0),
});

// strict: попытка передать id, chatId, role и т.п. — явный 400, а не тихое игнорирование.
export const updateMeSchema = z
  .object({
    application_contact: contactString('application_contact').nullable(),
  })
  .strict();

export const benchmarkQuerySchema = z.object({
  region_code: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(200),
});

export const idParamSchema = z.object({ id: POSITIVE_INT.max(POSTGRES_INT4_MAX) });

export const updateTeamMemberSchema = z.object({ reliable: z.boolean() }).strict();

// candidate_ids не передан — приглашаем всю бригаду.
export const inviteTeamSchema = z
  .object({
    candidate_ids: z.array(z.number().int().positive().max(POSTGRES_INT4_MAX)).min(1).max(100).optional(),
  })
  .strict();

export function checkMergedVacancyConstraints(merged: {
  title: string;
  region_code?: string | null;
  schedule?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  description?: string | null;
  contact_info?: string | null;
  headcount?: number | null;
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

  const length = vacancyCardTextLength({
    title: merged.title,
    regionCode: merged.region_code ?? '',
    schedule: merged.schedule ?? 'temporary',
    salaryMin: merged.salary_min ?? null,
    salaryMax: merged.salary_max ?? null,
    description: merged.description ?? null,
    contactInfo: merged.contact_info ?? null,
    headcount: merged.headcount ?? null,
  });
  if (length > MAX_CARD_TEXT_LIMIT) {
    return {
      ok: false,
      field: 'description',
      message: `resulting vacancy card text is ${length} characters, exceeds MAX limit of ${MAX_CARD_TEXT_LIMIT}; shorten description or contact_info`,
    };
  }

  return { ok: true };
}
