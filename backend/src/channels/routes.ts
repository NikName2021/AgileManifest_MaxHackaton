import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { sendError, zodFieldErrors } from '../errors.js';
import { idParamSchema, updateChannelSchema } from '../validation.js';
import { normalizeRegion } from '../regions/dictionary.js';
import { listChannels, updateChannel } from './service.js';

export function registerChannelRoutes(app: FastifyInstance) {
  // Каналы и чаты, куда пользователь добавил бота.
  app.get('/api/partner-channels', { preHandler: requireAuth }, async (request) => {
    return listChannels(request.sessionUserId!);
  });

  app.patch('/api/partner-channels/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendError(reply, 400, 'validation_error', 'invalid id', zodFieldErrors(params.error.flatten()));
    }
    const parsed = updateChannelSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
    }
    const body = parsed.data;
    let regionSubject: string | null | undefined;
    if (body.region_code !== undefined) {
      regionSubject = body.region_code === null ? null : normalizeRegion(body.region_code);
      if (body.region_code !== null && !regionSubject) {
        return sendError(reply, 400, 'validation_error', 'unknown region', { region_code: ['region is not recognised, use a code from GET /api/regions'] });
      }
    }
    const result = await updateChannel(request.sessionUserId!, params.data.id, {
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(regionSubject !== undefined ? { regionSubject } : {}),
      ...(body.student_only !== undefined ? { studentOnly: body.student_only } : {}),
    });
    if (result === 'not_found') return sendError(reply, 404, 'not_found', 'channel not found');
    if (result === 'removed') return sendError(reply, 409, 'conflict', 'the bot was removed from this chat, add it again first');
    return result;
  });
}
