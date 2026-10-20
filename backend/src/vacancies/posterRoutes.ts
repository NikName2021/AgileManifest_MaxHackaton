import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Vacancy } from '@prisma/client';
import { db } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { sendError, zodFieldErrors } from '../errors.js';
import { idParamSchema } from '../validation.js';
import { buildApplyDeepLink } from './cardText.js';
import { renderPosterSvg, renderQrSvg } from './poster.js';

async function ownVacancy(request: FastifyRequest, reply: FastifyReply): Promise<Vacancy | undefined> {
  const params = idParamSchema.safeParse(request.params);
  if (!params.success) {
    sendError(reply, 400, 'validation_error', 'invalid id', zodFieldErrors(params.error.flatten()));
    return undefined;
  }
  const vacancy = await db.vacancy.findUnique({ where: { id: params.data.id } });
  if (!vacancy) {
    sendError(reply, 404, 'not_found', 'vacancy not found');
    return undefined;
  }
  if (vacancy.employerUserId !== request.sessionUserId) {
    sendError(reply, 403, 'forbidden', 'not your vacancy');
    return undefined;
  }
  return vacancy;
}

// QR ведёт на deep link с меткой qr — отклики с объявления видны в статистике отдельно.
function qrLink(vacancy: Vacancy, reply: FastifyReply): string | undefined {
  if (vacancy.status !== 'published') {
    sendError(reply, 409, 'vacancy_unavailable', 'only a published vacancy has an apply link');
    return undefined;
  }
  const url = buildApplyDeepLink(vacancy.id, undefined, 'qr');
  if (!url) {
    sendError(reply, 503, 'service_unavailable', 'bot username is unknown, set MAX_BOT_USERNAME');
    return undefined;
  }
  return url;
}

export function registerPosterRoutes(app: FastifyInstance) {
  app.get('/api/vacancies/:id/qr.svg', { preHandler: requireAuth }, async (request, reply) => {
    const vacancy = await ownVacancy(request, reply);
    if (!vacancy) return reply;
    const url = qrLink(vacancy, reply);
    if (!url) return reply;
    return reply.type('image/svg+xml; charset=utf-8').send(await renderQrSvg(url));
  });

  app.get('/api/vacancies/:id/poster.svg', { preHandler: requireAuth }, async (request, reply) => {
    const vacancy = await ownVacancy(request, reply);
    if (!vacancy) return reply;
    const url = qrLink(vacancy, reply);
    if (!url) return reply;
    return reply.type('image/svg+xml; charset=utf-8').send(await renderPosterSvg(vacancy, url));
  });

  // Сколько откликов и откуда: карточка в чате, ссылка, QR-объявление, подписка, канал, мини-приложение, бригада.
  app.get('/api/vacancies/:id/stats', { preHandler: requireAuth }, async (request, reply) => {
    const vacancy = await ownVacancy(request, reply);
    if (!vacancy) return reply;
    const [bySource, byStatus] = await Promise.all([
      db.application.groupBy({ by: ['source'], where: { vacancyId: vacancy.id }, _count: { _all: true } }),
      db.application.groupBy({ by: ['status'], where: { vacancyId: vacancy.id }, _count: { _all: true } }),
    ]);
    const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
    return {
      total,
      bySource: Object.fromEntries(bySource.map((row) => [row.source ?? 'unknown', row._count._all])),
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
    };
  });
}
