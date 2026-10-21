import { vi } from 'vitest';
import type { User } from '@prisma/client';
import { db } from '../src/db.js';
import { issueSessionToken } from '../src/auth/session.js';

// Мок доставки в MAX: реальные сообщения не уходят, тесты видят попытки отправки.
export const sendMessageMock = vi.fn(async (_chatId: string, _text: string, _buttons?: unknown) => ({
  message: { body: { mid: `mid-${Math.random().toString(36).slice(2)}` } },
}));

export const maxApiMock = {
  getMe: vi.fn(async () => ({})),
  registerCommands: vi.fn(async () => ({})),
  sendMessage: sendMessageMock,
  answerCallback: vi.fn(async () => ({})),
  createSubscription: vi.fn(async () => ({})),
  listSubscriptions: vi.fn(async () => ({ subscriptions: [] })),
  getChat: vi.fn(async (_chatId: string) => ({ title: 'Студотряды КубГУ', type: 'channel' })),
  deleteSubscription: vi.fn(async () => ({})),
};

// Фоновая рассылка после публикации из прошлого теста ещё может читать таблицы — без ожидания
// TRUNCATE ловил deadlock (40P01) в CI. Импорт ленивый: helpers загружается внутри фабрики
// vi.mock клиента MAX, а модуль рассылки сам зависит от этого клиента — статический импорт
// замыкал загрузку в цикл, и тесты зависали до старта.
export async function resetDb() {
  const { settleBroadcasts } = await import('../src/vacancies/broadcast.js');
  await settleBroadcasts();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE application_events, channel_deliveries, partner_channels, subscription_deliveries, job_subscriptions, team_invites, team_marks, applications, pending_applications, dialog_sessions, benchmark_cache, vacancies, users RESTART IDENTITY CASCADE'
  );
}

export interface TestUser {
  user: User;
  auth: { authorization: string };
}

// По умолчанию — пользователь, уже запускавший бота (chatId и dialogChatId заданы).
export async function createUser(
  name: string,
  options: { chatId?: string; dialogChatId?: string | null; displayName?: string | null } = {}
): Promise<TestUser> {
  const chatId = options.chatId ?? `chat-${name}`;
  const user = await db.user.create({
    data: {
      maxUserId: `max-${name}`,
      chatId,
      dialogChatId: options.dialogChatId === undefined ? chatId : options.dialogChatId,
      displayName: options.displayName === undefined ? name : options.displayName,
    },
  });
  return { user, auth: { authorization: `Bearer ${issueSessionToken(user.id)}` } };
}

export function webhookHeaders() {
  return { 'x-max-bot-api-secret': 'test-webhook-secret' };
}

export function sentTo(chatId: string) {
  return sendMessageMock.mock.calls.filter((call) => call[0] === chatId);
}
