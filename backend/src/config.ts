import 'dotenv/config';
import { createHmac } from 'node:crypto';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const maxBotToken = required('MAX_BOT_TOKEN');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  maxApiBaseUrl: process.env.MAX_API_BASE_URL ?? 'https://platform-api2.max.ru',
  maxBotToken,
  maxWebhookSecret: process.env.MAX_WEBHOOK_SECRET ?? '',
  // Без него вебхук в MAX не регистрируется: REST работает, события от MAX не приходят.
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  // Приоритетнее username из GET /me.
  botUsernameOverride: process.env.MAX_BOT_USERNAME,
  // Если не задан — выводится из токена бота отдельным HMAC, чтобы не использовать сам токен как ключ.
  sessionSecret: process.env.SESSION_SECRET ?? createHmac('sha256', 'session-secret-derivation').update(maxBotToken).digest('hex'),
  // Доступ к API для жюри без MAX-логина; не задан — отключён.
  testApiToken: process.env.TEST_API_TOKEN,
  // Список origin через запятую; не задан — CORS разрешает любой origin.
  frontendOrigin: process.env.FRONTEND_ORIGIN,
};
