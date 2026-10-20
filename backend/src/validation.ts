import { z } from 'zod';
import { vacancyCardTextLength, MAX_CARD_TEXT_LIMIT } from './vacancies/cardText.js';
import { hasForbiddenChars, isMeaningful, normalizeMultiLine, normalizeSingleLine, SALARY_MAX } from './text.js';

export const SCHEDULE_ENUM = z.enum(['seasonal', 'temporary', 'permanent']);

// Колонки id — Postgres INT4: значение больше даёт ошибку БД вместо понятного 400.
const POSTGRES_INT4_MAX = 2147483647;

// Текстовое поле: нормализация пробелов, длина после нормализации, запрет управляющих и невидимых
// символов. meaningful — непустое значение должно содержать букву или цифру.
function text(field: string, opts: { min?: number; max: number; multiline?: boolean; meaningful?: boolean }) {
  const { min = 0, max, multiline = false, meaningful = true } = opts;
  return z
    .string({ required_error: `${field} is required`, invalid_type_error: `${field} must be a string` })
    .transform(multiline ? normalizeMultiLine : normalizeSingleLine)
    .pipe(
      z
        .string()
        .min(min, min === 1 ? `${field} must not be empty` : `${field} must be at least ${min} characters`)
        .max(max, `${field} must be at most ${max} characters`)
        .refine((v) => !hasForbiddenChars(v), `${field} contains control or invisible characters`)
        .refine((v) => !meaningful || v === '' || isMeaningful(v), `${field} must contain letters or digits`)
    );
}

// Пустая строка в необязательном поле означает «нет значения».
function orNull<T extends z.ZodTypeAny>(schema: T) {
  return schema.transform((v: string) => (v === '' ? null : v));
}

const salary = z
  .number({ invalid_type_error: 'must be a number' })
  .int('must be an integer')
  .nonnegative('must not be negative')
  .max(SALARY_MAX, `must be at most ${SALARY_MAX}`);

// id из тела: JSON-число или строка из цифр; true, "1e3", "12abc" отклоняются.
const bodyId = z
  .union([z.number(), z.string().regex(/^\d{1,10}$/).transform(Number)], {
    errorMap: () => ({ message: 'must be a positive integer' }),
  })
  .pipe(z.number().int('must be a positive integer').positive('must be a positive integer').max(POSTGRES_INT4_MAX));

// Целое из query или пути (там всегда строка): только цифры, пустое значение — «не задано».
function queryInt(min: number, max: number) {
  return z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^\d{1,10}$/, 'must be a non-negative integer')
      .transform(Number)
      .pipe(z.number().min(min, `must be at least ${min}`).max(max, `must be at most ${max}`))
      .optional()
  );
}

const vacancyBaseShape = {
  title: text('title', { min: 1, max: 200 }),
  // Пустой регион допустим в черновике; опубликовать без него нельзя (server.ts).
  region_code: text('region_code', { max: 100 }).optional(),
  category: text('category', { min: 1, max: 100 }).optional(),
  schedule: SCHEDULE_ENUM.optional(),
  salary_min: salary.nullable().optional(),
  salary_max: salary.nullable().optional(),
  // Ограничение самого поля; длина всей карточки проверяется отдельно (checkCardLength).
  description: orNull(text('description', { max: 4000, multiline: true })).nullable().optional(),
  contact_info: orNull(text('contact_info', { max: 300 })).nullable().optional(),
  headcount: z.number().int().min(1).max(1000).nullable().optional(),
  student_friendly: z.boolean().optional(),
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
  student_friendly?: boolean;
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
    studentFriendly: data.student_friendly ?? false,
  });
  if (length > MAX_CARD_TEXT_LIMIT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `resulting vacancy card text is ${length} characters, exceeds MAX limit of ${MAX_CARD_TEXT_LIMIT}; shorten description or contact_info`,
      path: ['description'],
    });
  }
}

// strict во всех телах запросов: опечатка в имени поля или попытка передать id/role — явный 400,
// а не тихое игнорирование.
export const createVacancySchema = z
  .object(vacancyBaseShape)
  .strict()
  .superRefine(checkSalaryRange)
  .superRefine(checkCardLength);

// Межполевые проверки здесь невозможны (partial не видит сохранённых значений) —
// они в checkMergedVacancyConstraints.
export const updateVacancySchema = z
  .object(vacancyBaseShape)
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'at least one field is required' });

// Телефон, username или ссылка MAX. Тот же лимит применяет бот (application/service.ts).
export const APPLICATION_CONTACT_MAX_LENGTH = 200;

const contactString = (field: string) => text(field, { min: 1, max: APPLICATION_CONTACT_MAX_LENGTH });

export const createApplicationSchema = z
  .object({
    vacancy_id: bodyId,
    contact: contactString('contact'),
  })
  .strict();

export const APPLICATION_STATUS_ENUM = z.enum(['new', 'contacted', 'invited', 'hired', 'rejected']);

export const updateApplicationStatusSchema = z.object({ status: APPLICATION_STATUS_ENUM }).strict();

// initData MAX — несколько сотен байт; потолок защищает проверку подписи от огромных строк.
export const authMaxSchema = z
  .object({
    init_data: z.string().min(1, 'init_data is required').max(8192, 'init_data is too long'),
  })
  .strict();

export const listApplicationsQuerySchema = z.object({
  status: APPLICATION_STATUS_ENUM.optional(),
  limit: queryInt(1, 200).default('50'),
  offset: queryInt(0, POSTGRES_INT4_MAX).default('0'),
});

export const JOB_SORT_ENUM = z.enum(['newest', 'salary_desc']);

export const listJobsQuerySchema = z
  .object({
    q: text('q', { max: 200, meaningful: false }).optional(),
    region_code: text('region_code', { max: 100, meaningful: false }).optional(),
    category: text('category', { max: 100, meaningful: false }).optional(),
    schedule: SCHEDULE_ENUM.optional(),
    salary_from: queryInt(0, SALARY_MAX),
    salary_to: queryInt(0, SALARY_MAX),
    student_friendly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    sort: JOB_SORT_ENUM.optional().default('newest'),
    limit: queryInt(1, 100).default('20'),
    offset: queryInt(0, POSTGRES_INT4_MAX).default('0'),
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
  limit: queryInt(1, 100).default('20'),
  offset: queryInt(0, POSTGRES_INT4_MAX).default('0'),
});

export const updateMeSchema = z
  .object({
    application_contact: contactString('application_contact').nullable(),
  })
  .strict();

export const benchmarkQuerySchema = z.object({
  region_code: text('region_code', { min: 1, max: 100 }),
  category: text('category', { min: 1, max: 200 }),
});

export const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d{1,10}$/, 'must be a positive integer')
    .transform(Number)
    .pipe(z.number().positive('must be a positive integer').max(POSTGRES_INT4_MAX, 'must be a positive integer')),
});

// region_code — код субъекта или свободный текст (распознаётся справочником).
export const createSubscriptionSchema = z
  .object({
    region_code: text('region_code', { min: 1, max: 100 }).nullable().optional(),
    category: text('category', { min: 1, max: 100 }).nullable().optional(),
    schedule: SCHEDULE_ENUM.nullable().optional(),
    salary_from: salary.nullable().optional(),
    student_only: z.boolean().optional(),
  })
  .strict();

export const updateChannelSchema = z
  .object({
    active: z.boolean().optional(),
    region_code: text('region_code', { min: 1, max: 100 }).nullable().optional(),
    student_only: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'at least one field is required' });

// Смену назначают не дальше чем на год вперёд — дальше почти наверняка ошибка в дате.
const SHIFT_MAX_AHEAD_MS = 366 * 24 * 3600 * 1000;

// start_at — ISO 8601 со смещением (например 2026-06-21T07:00:00+03:00); null снимает назначение.
export const setShiftSchema = z
  .object({
    start_at: z
      .string()
      .datetime({ offset: true, message: 'must be an ISO 8601 date-time with offset' })
      .refine((v) => new Date(v).getTime() <= Date.now() + SHIFT_MAX_AHEAD_MS, 'must be within a year from now')
      .nullable(),
    note: orNull(text('note', { max: 200 })).nullable().optional(),
  })
  .strict();

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
  student_friendly?: boolean;
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
    studentFriendly: merged.student_friendly ?? false,
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
