import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

// 30 дней — mini-app не должен просить пользователя логиниться заново каждый день.
const SESSION_TTL_SECONDS = 30 * 24 * 3600;

function sign(payload: string): string {
  return createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

export function issueSessionToken(userId: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = sign(payload);
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export function verifySessionToken(token: string): { ok: true; userId: number } | { ok: false } {
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return { ok: false };
  }
  const parts = decoded.split('.');
  if (parts.length !== 3) return { ok: false };
  const [userIdRaw, expiresRaw, signature] = parts;
  const payload = `${userIdRaw}.${expiresRaw}`;
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now() / 1000) return { ok: false };

  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId)) return { ok: false };

  return { ok: true, userId };
}
