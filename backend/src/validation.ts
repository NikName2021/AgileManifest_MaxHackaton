import { z } from 'zod';

// Общие zod-схемы для REST API (раздел 6 ТЗ) — раньше валидация была ручной ("if (!body?.x)"),
// пропускала неверные типы (например строку вместо числа в salary_min) и не давала внятных
// сообщений об ошибке. safeParse ниже используется в server.ts для каждого мутирующего эндпоинта.

export const SCHEDULE_ENUM = z.enum(['seasonal', 'temporary', 'permanent']);

// salary_min/salary_max проверяются отдельно (nonnegative) и совместно (min <= max) — раньше
// соотношение между ними вообще не проверялось, можно было создать вакансию с min > max.
const vacancyBaseShape = {
  title: z.string().trim().min(1, 'title is required').max(200),
  region_code: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  schedule: SCHEDULE_ENUM.optional(),
  salary_min: z.coerce.number().int().nonnegative().nullable().optional(),
  salary_max: z.coerce.number().int().nonnegative().nullable().optional(),
  // Лимит согласован с картой вакансии (см. vacancies/publish.ts) — MAX ограничивает длину
  // сообщения, точное число не подтверждено документацией, поэтому взят консервативный запас.
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

export const createVacancySchema = z.object(vacancyBaseShape).superRefine(checkSalaryRange);

// Редактирование черновика (раздел 3.1 хендоффа) — все поля необязательны, но хотя бы одно
// должно присутствовать, иначе PATCH с пустым телом ничего не делает и это стоит явно отклонить.
export const updateVacancySchema = z
  .object(vacancyBaseShape)
  .partial()
  .superRefine(checkSalaryRange)
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
