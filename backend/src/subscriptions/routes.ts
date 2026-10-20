import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { sendError, zodFieldErrors } from '../errors.js';
import { createSubscriptionSchema, idParamSchema } from '../validation.js';
import { normalizeRegion } from '../regions/dictionary.js';
import { createSubscription, deleteSubscription, listSubscriptions, SUBSCRIPTIONS_PER_USER } from './service.js';

export function registerSubscriptionRoutes(app: FastifyInstance) {
  app.get('/api/me/subscriptions', { preHandler: requireAuth }, async (request) => {
    return listSubscriptions(request.sessionUserId!);
  });

  app.post('/api/me/subscriptions', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createSubscriptionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
    }
    const body = parsed.data;
    const regionSubject = body.region_code ? normalizeRegion(body.region_code) : null;
    if (body.region_code && !regionSubject) {
      return sendError(reply, 400, 'validation_error', 'unknown region', { region_code: ['region is not recognised, use a code from GET /api/regions'] });
    }
    const result = await createSubscription(request.sessionUserId!, {
      regionSubject,
      category: body.category ?? null,
      schedule: body.schedule ?? null,
      salaryFrom: body.salary_from ?? null,
      studentOnly: body.student_only ?? false,
    });
    if (!result.ok) {
      return sendError(reply, 409, 'subscription_limit_reached', `no more than ${SUBSCRIPTIONS_PER_USER} subscriptions per user`);
    }
    return reply.code(201).send(result.subscription);
  });

  app.delete('/api/me/subscriptions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendError(reply, 400, 'validation_error', 'invalid id', zodFieldErrors(params.error.flatten()));
    }
    if (!(await deleteSubscription(request.sessionUserId!, params.data.id))) {
      return sendError(reply, 404, 'not_found', 'subscription not found');
    }
    return reply.code(204).send();
  });
}
