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
    // Не даём одному зависшему запросу к MAX API повесить весь обработчик вебхука/джобу напоминаний.
    // AbortSignal.timeout при срабатывании роняет fetch с ошибкой err.name === 'TimeoutError' —
    // на это опирается publish.ts, чтобы отличить "точно не ушло" от "неизвестно, ушло или нет".
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MAX API ${init.method ?? 'GET'} ${path} -> ${res.status}: ${body}`);
  }

  // Некоторые методы (например DELETE) могут не возвращать тело — подстрахуемся
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// MAX документирует лимит 2 сообщения в секунду на один чат (dev.max.ru/docs-api/methods/POST/messages) —
// раньше в DECISIONS.md ошибочно говорилось, что лимит нигде не опубликован. Полноценная очередь
// с retry/backoff по-прежнему отдельная задача (см. DECISIONS.md), но сам известный лимит дёшево
// соблюсти прямо здесь: минимальный интервал между отправками в ОДИН И ТОТ ЖЕ чат. Между разными
// чатами не сериализуем — лимит именно "на чат", а не глобальный.
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
  // Проставляем ДО реального запроса — параллельные вызовы на один chatId тоже должны
  // выстроиться в очередь, а не пройти таймер одновременно по устаревшему значению last.
  lastSentAtByChat.set(chatId, Date.now());
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

  // ВАЖНО: согласно документации (dev.max.ru), chat_id/user_id для POST /messages
  // передаются как query-параметры URL, а не в теле запроса. Раньше здесь был баг —
  // chat_id клали в JSON body, из-за чего MAX не понимал, куда слать сообщение.
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

  // Подтверждение нажатия inline-кнопки (POST /answers). callback_id — query-параметр.
  // Без этого вызова MAX-клиент у пользователя показывает "часики" на кнопке до таймаута.
  // Best-effort: ошибка подтверждения не должна ронять обработку самого апдейта,
  // поэтому вызывающий код (webhook.ts) оборачивает вызов в try/catch.
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

  // Продакшен-путь получения обновлений: подписка на вебхук.
  // Тело подтверждено документацией — url, update_types, secret.
  createSubscription: (url: string, updateTypes: string[]) =>
    maxRequest('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ url, update_types: updateTypes, secret: config.maxWebhookSecret }),
    }),

  listSubscriptions: () => maxRequest('/subscriptions'),

  deleteSubscription: (url: string) =>
    maxRequest('/subscriptions', { method: 'DELETE' }, { url }),
};
