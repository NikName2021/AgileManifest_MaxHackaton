import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { sendError, zodFieldErrors } from '../errors.js';
import { idParamSchema, inviteTeamSchema, updateTeamMemberSchema } from '../validation.js';
import { inviteTeam, listInvites, listTeam, setReliable } from './service.js';

function sendAccessError(reply: FastifyReply, error: 'not_found' | 'forbidden' | 'vacancy_unavailable') {
  if (error === 'not_found') return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (error === 'forbidden') return sendError(reply, 403, 'forbidden', 'not your vacancy');
  return sendError(reply, 409, 'vacancy_unavailable', 'only a published vacancy can be offered to the team');
}

export function registerTeamRoutes(app: FastifyInstance) {
  app.get('/api/team', { preHandler: requireAuth }, async (request) => {
    return listTeam(request.sessionUserId!);
  });

  app.patch('/api/team/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendError(reply, 400, 'validation_error', 'invalid candidate id', zodFieldErrors(params.error.flatten()));
    }
    const body = updateTeamMemberSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(body.error.flatten()));
    }
    const updated = await setReliable(request.sessionUserId!, params.data.id, body.data.reliable);
    if (!updated) return sendError(reply, 404, 'not_found', 'this person was never hired on your vacancies');
    return { candidateId: params.data.id, reliable: body.data.reliable };
  });

  app.post('/api/vacancies/:id/team-invites', { preHandler: requireAuth }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendError(reply, 400, 'validation_error', 'invalid id', zodFieldErrors(params.error.flatten()));
    }
    const body = inviteTeamSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(body.error.flatten()));
    }
    const result = await inviteTeam(request.sessionUserId!, params.data.id, body.data.candidate_ids);
    if (!result.ok) return sendAccessError(reply, result.error);
    return {
      sent: result.results.filter((r) => r.outcome === 'sent').length,
      results: result.results,
    };
  });

  app.get('/api/vacancies/:id/team-invites', { preHandler: requireAuth }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendError(reply, 400, 'validation_error', 'invalid id', zodFieldErrors(params.error.flatten()));
    }
    const result = await listInvites(request.sessionUserId!, params.data.id);
    if (!result.ok) return sendAccessError(reply, result.error);
    return { items: result.items };
  });
}
