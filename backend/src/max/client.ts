import { config } from '../config.js';

const BASE = config.maxApiBaseUrl;

async function maxRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': config.maxBotToken,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MAX API ${init.method ?? 'GET'} ${path} -> ${res.status}: ${body}`);
  }

  // Некоторые методы (например DELETE) могут не возвращать тело — подстрахуемся
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface InlineButton {
  type: 'callback' | 'link' | 'request_contact' | 'request_geo_location' | 'open_app' | 'message' | 'clipboard';
  text: string;
  payload?: string;
  url?: string;
}

export const maxApi = {
  getMe: () => maxRequest('/me'),

  registerCommands: (commands: { name: string; description: string }[]) =>
    maxRequest('/me/commands', { method: 'PATCH', body: JSON.stringify({ commands }) }),

  sendMessage: (chatId: string, text: string, buttons?: InlineButton[][]) =>
    maxRequest('/messages', {
      method: 'POST',
      body: JSON.stringify({
        chat_id: chatId,
        text,
        format: 'markdown',
        ...(buttons
          ? {
              attachments: [
                {
                  type: 'inline_keyboard',
                  payload: { buttons },
                },
              ],
            }
          : {}),
      }),
    }),

  // Продакшен-путь получения обновлений: подписка на вебхук.
  // Тело подтверждено документацией — url, update_types, secret.
  createSubscription: (url: string, updateTypes: string[]) =>
    maxRequest('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ url, update_types: updateTypes, secret: config.maxWebhookSecret }),
    }),

  listSubscriptions: () => maxRequest('/subscriptions'),
};