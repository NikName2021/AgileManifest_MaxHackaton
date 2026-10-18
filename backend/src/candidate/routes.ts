import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { sendError, zodFieldErrors } from '../errors.js';
import { idParamSchema, listJobsQuerySchema, listMyApplicationsQuerySchema, updateMeSchema } from '../validation.js';
import { getJob, getProfile, listJobFilters, listJobs, listMyApplications, updateApplicationContact } from './service.js';

// Маршруты кабинета работника. Отдельно от /api/vacancies и GET /api/applications — те остаются
// кабинетом работодателя (только свои вакансии и входящие отклики), их назначение не меняется.
export function registerCandidateRoutes(app: FastifyInstance) {
  app.get('/api/jobs', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = listJobsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_error', 'invalid query parameters', zodFieldErrors(parsed.error.flatten()));
    }
    return listJobs(request.sessionUserId!, parsed.data);
  });

  // Регистрируется до /api/jobs/:id не обязательно (Fastify отдаёт приоритет статическому пути),
  // но держим рядом с каталогом — значения фильтров считаются по той же видимости, что и каталог.
  app.get('/api/jobs/filters', { preHandler: requireAuth }, async (request) => {
    return listJobFilters(request.sessionUserId!);
  });

  app.get('/api/jobs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_error', 'invalid vacancy id', zodFieldErrors(parsed.error.flatten()));
    }
    const job = await getJob(request.sessionUserId!, parsed.data.id);
    if (!job) return sendError(reply, 404, 'not_found', 'vacancy not found');
    return job;
  });

  app.get('/api/me/applications', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = listMyApplicationsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_error', 'invalid query parameters', zodFieldErrors(parsed.error.flatten()));
    }
    return listMyApplications(request.sessionUserId!, parsed.data);
  });

  app.get('/api/me', { preHandler: requireAuth }, async (request, reply) => {
    const profile = await getProfile(request.sessionUserId!);
    if (!profile) return sendError(reply, 401, 'unauthorized', 'session user no longer exists');
    return profile;
  });

  app.patch('/api/me', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = updateMeSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
    }
    const profile = await updateApplicationContact(request.sessionUserId!, parsed.data.application_contact);
    if (!profile) return sendError(reply, 401, 'unauthorized', 'session user no longer exists');
    return profile;
  });
}
