import { vi } from 'vitest';
import type { User } from '@prisma/client';
import { db } from '../src/db.js';
import { issueSessionToken } from '../src/auth/session.js';

// Подменённая доставка в MAX (см. vi.mock в тестовых файлах): ни одно сообщение не уходит
// реальным пользователям, а тесты видят, какие именно попытки отправки были.
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
  deleteSubscription: vi.fn(async () => ({})),
};

export async function resetDb() {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE applications, pending_applications, dialog_sessions, benchmark_cache, vacancies, users RESTART IDENTITY CASCADE'
  );
}

export interface TestUser {
  user: User;
  auth: { authorization: string };
}

// Пользователь «как после входа в мини-приложение и запуска бота»: chatId/dialogChatId заданы,
// если не сказано иное. Токен — та же подпись сессии, что выдаёт POST /api/auth/max.
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
