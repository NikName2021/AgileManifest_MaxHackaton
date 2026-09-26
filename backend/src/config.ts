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
  // Публичный HTTPS-адрес backend (например, ngrok) — нужен, чтобы зарегистрировать вебхук в MAX.
  // Без него backend работает (можно тестировать REST API), но события от MAX не будут приходить.
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  // Ник бота для deep link (https://max.ru/<ник>?start=...) — обычно определяется сам через
  // GET /me при старте (см. max/botInfo.ts), эта переменная — ручной фолбэк, если бот вернул
  // username в неожиданном поле или недоступен на момент старта.
  botUsernameOverride: process.env.MAX_BOT_USERNAME,
  // Секрет для подписи собственных сессионных токенов mini-app (не путать с MAX_WEBHOOK_SECRET).
  // Если не задан явно — выводим из токена бота отдельным HMAC-лейблом, чтобы не переиспользовать
  // сам токен бота как ключ напрямую. Для реальной сдачи лучше задать SESSION_SECRET явно в .env.
  sessionSecret: process.env.SESSION_SECRET ?? createHmac('sha256', 'session-secret-derivation').update(maxBotToken).digest('hex'),
  // Токен для тестового доступа к /api/* без реального MAX-аккаунта — для проверки жюри
  // (раздел 11 ТЗ, "тестовые учётки"). Если не задан — тестовый вход отключён.
  testApiToken: process.env.TEST_API_TOKEN,
};
