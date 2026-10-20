import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});
vi.mock('../src/trudvsem/client.js', () => ({ searchTrudvsemVacancies: vi.fn(async () => []) }));

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { MAX_CARD_TEXT_LIMIT } from '../src/vacancies/cardText.js';
import { createUser, resetDb, sendMessageMock, sentTo, webhookHeaders, type TestUser } from './helpers.js';

beforeAll(async () => {
  setBotUsername('season_test_bot');
  await app.ready();
});

afterAll(async () => {
  await settleBroadcasts();
  await app.close();
  await db.$disconnect();
});

let A: TestUser;
let B: TestUser;

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  B = await createUser('B');
});

function message(user: TestUser, chatId: string, text: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: { update_type: 'message_created', message: { recipient: { chat_id: chatId }, sender: { user_id: user.user.maxUserId }, body: { text } } },
  });
}

function press(user: TestUser, chatId: string, payload: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: { update_type: 'message_callback', message: { recipient: { chat_id: chatId } }, callback: { callback_id: 'cb', payload, user: { user_id: user.user.maxUserId } } },
  });
}

async function completeDialog(user: TestUser, chatId: string, requirements = 'опыт не нужен') {
  await message(user, chatId, '/новая_вакансия');
  for (const answer of ['Сборщик черешни', 'Краснодар', 'seasonal', '3000-4000', requirements, '+7 900 000-00-00']) {
    await message(user, chatId, answer);
  }
  return db.vacancy.findFirstOrThrow({ where: { employerUserId: user.user.id }, orderBy: { id: 'desc' } });
}

describe('предпросмотр карточки в боте', () => {
  it('после диалога — черновик и карточка с кнопками, ничего не опубликовано', async () => {
    const vacancy = await completeDialog(A, 'chat-A');
    expect(vacancy).toMatchObject({ status: 'draft', cardMessageId: null, regionSubject: '23' });

    const [intro, preview] = sentTo('chat-A').slice(-2);
    expect(intro[1]).toContain('Проверьте карточку');
    expect(preview[1]).toContain('Сборщик черешни');
    expect(preview[1]).toContain(`start=apply_${vacancy.id}`);
    expect(preview[2]).toEqual([[
      { type: 'callback', text: 'Опубликовать', payload: `draft_publish:${vacancy.id}` },
      { type: 'callback', text: 'Оставить черновиком', payload: `draft_keep:${vacancy.id}` },
    ]]);
  });

  it('«Опубликовать» — карточка уходит, повторное нажатие не создаёт дубль', async () => {
    const vacancy = await completeDialog(A, 'chat-A');
    sendMessageMock.mockClear();

    await press(A, 'chat-A', `draft_publish:${vacancy.id}`);
    const published = await db.vacancy.findUniqueOrThrow({ where: { id: vacancy.id } });
    expect(published.status).toBe('published');
    expect(published.cardMessageId).not.toBeNull();
    const cards = sentTo('chat-A').filter((c) => Array.isArray(c[2]) && (c[2] as { payload?: string }[][])[0][0].payload === `apply:${vacancy.id}`);
    expect(cards).toHaveLength(1);
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('Опубликовано');

    await press(A, 'chat-A', `draft_publish:${vacancy.id}`);
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('уже опубликована');
    expect(sentTo('chat-A').filter((c) => Array.isArray(c[2]) && (c[2] as { payload?: string }[][])[0][0].payload === `apply:${vacancy.id}`)).toHaveLength(1);
  });

  it('«Оставить черновиком» — остаётся черновиком', async () => {
    const vacancy = await completeDialog(A, 'chat-A');
    await press(A, 'chat-A', `draft_keep:${vacancy.id}`);
    expect((await db.vacancy.findUniqueOrThrow({ where: { id: vacancy.id } })).status).toBe('draft');
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('Черновик сохранён');
  });

  it('чужое нажатие в групповом чате игнорируется', async () => {
    const vacancy = await completeDialog(A, 'group-1');
    sendMessageMock.mockClear();
    await press(B, 'group-1', `draft_publish:${vacancy.id}`);
    expect((await db.vacancy.findUniqueOrThrow({ where: { id: vacancy.id } })).status).toBe('draft');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('длинные требования: предпросмотр укладывается в лимит MAX', async () => {
    await completeDialog(A, 'chat-A', 'очень подробные требования '.repeat(300));
    const preview = sentTo('chat-A').at(-1)!;
    expect(preview[1].length).toBeLessThanOrEqual(MAX_CARD_TEXT_LIMIT);
    expect(sentTo('chat-A').at(-2)?.[1]).toContain('пришлось сократить');
  });
});
