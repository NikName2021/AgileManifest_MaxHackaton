import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { sendError, zodFieldErrors } from '../errors.js';
import { idParamSchema, updateChannelSchema } from '../validation.js';
import { normalizeRegion } from '../regions/dictionary.js';
import { listChannels, updateChannel, type ChannelPatch } from './service.js';
import { findCategory } from '../categories/service.js';

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
    // Сферы — только существующие: синоним («кафе») заменяется на название, опечатка — 400.
    let categories: string[] | undefined;
    if (body.categories !== undefined) {
      const found = await Promise.all(body.categories.map((c) => findCategory(c)));
      const unknown = body.categories.filter((_, i) => !found[i]);
      if (unknown.length > 0) {
        return sendError(reply, 400, 'validation_error', 'unknown category', {
          categories: [`unknown categories: ${unknown.join(', ')}; pick from GET /api/categories or GET /api/categories/suggest`],
        });
      }
      categories = [...new Set(found.map((f) => f!.name))];
    }
    const patch: ChannelPatch = {
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(regionSubject !== undefined ? { regionSubject } : {}),
      ...(body.student_only !== undefined ? { studentOnly: body.student_only } : {}),
      ...(categories !== undefined ? { categories } : {}),
      ...(body.schedule !== undefined ? { schedule: body.schedule } : {}),
      ...(body.salary_from !== undefined ? { salaryFrom: body.salary_from } : {}),
      ...(body.trusted_only !== undefined ? { trustedOnly: body.trusted_only } : {}),
      ...(body.badges !== undefined ? { badges: body.badges } : {}),
      ...(body.mode !== undefined ? { mode: body.mode } : {}),
      ...(body.digest_hour !== undefined ? { digestHour: body.digest_hour } : {}),
    };
    const result = await updateChannel(request.sessionUserId!, params.data.id, patch);
    if (result === 'not_found') return sendError(reply, 404, 'not_found', 'channel not found');
    if (result === 'removed') return sendError(reply, 409, 'conflict', 'the bot was removed from this chat, add it again first');
    return result;
  });
}
