import { z } from 'zod';

// Общие zod-схемы для REST API (раздел 6 ТЗ) — раньше валидация была ручной ("if (!body?.x)"),
// пропускала неверные типы (например строку вместо числа в salary_min) и не давала внятных
// сообщений об ошибке. safeParse ниже используется в server.ts для каждого мутирующего эндпоинта.

export const SCHEDULE_ENUM = z.enum(['seasonal', 'temporary', 'permanent']);

export const createVacancySchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200),
  region_code: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  schedule: SCHEDULE_ENUM.optional(),
  salary_min: z.coerce.number().int().nonnegative().nullable().optional(),
  salary_max: z.coerce.number().int().nonnegative().nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
});

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
