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
};