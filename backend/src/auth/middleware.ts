import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { config } from '../config.js';
import { verifySessionToken } from './session.js';

// Фиксированный технический аккаунт для теста API жюри без реального MAX-логина
// (раздел 11 ТЗ — "тестовые учётки"). Активен только если задан TEST_API_TOKEN.
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
    reply.code(401).send({ error: 'missing Authorization: Bearer <token>' });
    return;
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
    reply.code(401).send({ error: 'invalid or expired session' });
    return;
  }
  request.sessionUserId = verified.userId;
}
