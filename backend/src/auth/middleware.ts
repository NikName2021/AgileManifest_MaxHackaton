import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { config } from '../config.js';
import { verifySessionToken } from './session.js';
import { sendError } from '../errors.js';

// Технический аккаунт жюри для доступа по TEST_API_TOKEN без MAX-логина.
const TEST_USER_MAX_ID = 'test-jury-account';

declare module 'fastify' {
  interface FastifyRequest {
    sessionUserId?: number;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
  if (!token) {
    return sendError(reply, 401, 'unauthorized', 'missing Authorization: Bearer <token>');
  }

  if (config.testApiToken && token === config.testApiToken) {
    const testUser = await db.user.upsert({
      where: { maxUserId: TEST_USER_MAX_ID },
      update: {},
      create: { maxUserId: TEST_USER_MAX_ID, chatId: TEST_USER_MAX_ID, displayName: 'Тестовый аккаунт жюри' },
    });
    request.sessionUserId = testUser.id;
    return;
  }

  const verified = verifySessionToken(token);
  if (!verified.ok) {
    return sendError(reply, 401, 'unauthorized', 'invalid or expired session');
  }
  request.sessionUserId = verified.userId;
}
