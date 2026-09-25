import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  maxApiBaseUrl: process.env.MAX_API_BASE_URL ?? 'https://platform-api2.max.ru',
  maxBotToken: required('MAX_BOT_TOKEN'),
  maxWebhookSecret: process.env.MAX_WEBHOOK_SECRET ?? '',
  // Публичный HTTPS-адрес backend (например, ngrok) — нужен, чтобы зарегистрировать вебхук в MAX.
  // Без него backend работает (можно тестировать REST API), но события от MAX не будут приходить.
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
};