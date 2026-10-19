import { config } from '../config.js';

const BASE = config.maxApiBaseUrl;
const REQUEST_TIMEOUT_MS = 10_000;

type QueryValue = string | number | boolean | undefined;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function maxRequest<T>(
  path: string,
  init: RequestInit = {},
  query?: Record<string, QueryValue>,
): Promise<T> {
  const res = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      'Authorization': config.maxBotToken,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    // err.name === 'TimeoutError' — по нему publish.ts отличает «точно не ушло» от «неизвестно».
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MAX API ${init.method ?? 'GET'} ${path} -> ${res.status}: ${body}`);
  }

  // Некоторые методы (например DELETE) отвечают без тела.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// Документированный лимит MAX — 2 сообщения в секунду на чат. Разные чаты не сериализуются.
// Персистентной очереди с retry нет — известное ограничение.
const MIN_MS_BETWEEN_MESSAGES_PER_CHAT = 550; // 2/сек = 500мс, +50мс запас
const lastSentAtByChat = new Map<string, number>();

async function throttlePerChat(chatId: string): Promise<void> {
  const last = lastSentAtByChat.get(chatId);
  if (last !== undefined) {
    const elapsed = Date.now() - last;
    if (elapsed < MIN_MS_BETWEEN_MESSAGES_PER_CHAT) {
      await new Promise((resolve) => setTimeout(resolve, MIN_MS_BETWEEN_MESSAGES_PER_CHAT - elapsed));
    }
  }
  // Метка ставится до запроса, чтобы параллельные отправки в один чат тоже выстроились по интервалу.
  lastSentAtByChat.set(chatId, Date.now());
  // Без очистки карта росла бы на каждый чат за всё время работы процесса.
  if (lastSentAtByChat.size > 10_000) {
    const staleBefore = Date.now() - MIN_MS_BETWEEN_MESSAGES_PER_CHAT;
    for (const [id, sentAt] of lastSentAtByChat) {
      if (sentAt < staleBefore) lastSentAtByChat.delete(id);
    }
  }
}

export interface InlineButton {
  type: 'callback' | 'link' | 'request_contact' | 'request_geo_location' | 'open_app' | 'message' | 'clipboard';
  text: string;
  payload?: string;
  url?: string;
}

export interface SendMessageResult {
  message?: { body?: { mid?: string } };
}

export const maxApi = {
  getMe: () => maxRequest('/me'),

  registerCommands: (commands: { name: string; description: string }[]) =>
    maxRequest('/me/commands', { method: 'PATCH', body: JSON.stringify({ commands }) }),

  // chat_id передаётся query-параметром, а не в теле.
  sendMessage: async (chatId: string, text: string, buttons?: InlineButton[][]) => {
    await throttlePerChat(chatId);
    return maxRequest<SendMessageResult>(
      '/messages',
      {
        method: 'POST',
        body: JSON.stringify({
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
      },
      { chat_id: chatId },
    );
  },

  // Без подтверждения нажатия кнопка у пользователя «крутится» до таймаута.
  answerCallback: (callbackId: string, message?: { text: string; buttons?: InlineButton[][] }) =>
    maxRequest(
      '/answers',
      {
        method: 'POST',
        body: JSON.stringify({
          ...(message
            ? {
                message: {
                  text: message.text,
                  format: 'markdown',
                  ...(message.buttons
                    ? {
                        attachments: [
                          {
                            type: 'inline_keyboard',
                            payload: { buttons: message.buttons },
                          },
                        ],
                      }
                    : {}),
                },
              }
            : {}),
        }),
      },
      { callback_id: callbackId },
    ),

  createSubscription: (url: string, updateTypes: string[]) =>
    maxRequest('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ url, update_types: updateTypes, secret: config.maxWebhookSecret }),
    }),

  listSubscriptions: () => maxRequest('/subscriptions'),

  deleteSubscription: (url: string) =>
    maxRequest('/subscriptions', { method: 'DELETE' }, { url }),
};
