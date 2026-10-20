import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { notifySubscribers } from '../src/subscriptions/service.js';
import { createUser, resetDb, sendMessageMock, sentTo, webhookHeaders, type TestUser } from './helpers.js';

beforeAll(async () => {
  setBotUsername('season_test_bot');
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

let A: TestUser; // работодатель
let B: TestUser; // подписчик
let C: TestUser; // подписчик без личного чата

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  B = await createUser('B');
  C = await createUser('C', { chatId: '', dialogChatId: null });
});

function subscribe(user: TestUser, payload: object) {
  return app.inject({ method: 'POST', url: '/api/me/subscriptions', headers: user.auth, payload });
}

async function publish(body: object) {
  const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Сборщик', ...body } });
  const id = created.json().id as number;
  expect((await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: A.auth })).statusCode).toBe(200);
  return id;
}

function press(user: TestUser, payload: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: { update_type: 'message_callback', message: { recipient: { chat_id: user.user.chatId } }, callback: { callback_id: 'cb', payload, user: { user_id: user.user.maxUserId } } },
  });
}

function message(user: TestUser, text: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: { update_type: 'message_created', message: { recipient: { chat_id: user.user.chatId }, sender: { user_id: user.user.maxUserId }, body: { text } } },
  });
}

const noticesTo = (chatId: string) => sentTo(chatId).filter((c) => String(c[1]).includes('по вашей подписке'));

describe('API подписок', () => {
  it('создание, список, удаление; регион распознаётся по тексту', async () => {
    const res = await subscribe(B, { region_code: 'Кубань', schedule: 'seasonal', salary_from: 3000 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: expect.any(Number),
      region: { code: '23', name: 'Краснодарский край' },
      category: null,
      schedule: 'seasonal',
      salaryFrom: 3000,
      studentOnly: false,
      createdAt: expect.any(String),
    });

    const list = (await app.inject({ method: 'GET', url: '/api/me/subscriptions', headers: B.auth })).json();
    expect(list).toMatchObject({ hasBotChat: true, items: [{ id: res.json().id }] });
    expect((await app.inject({ method: 'GET', url: '/api/me/subscriptions', headers: C.auth })).json()).toEqual({ items: [], hasBotChat: false });

    expect((await app.inject({ method: 'DELETE', url: `/api/me/subscriptions/${res.json().id}`, headers: C.auth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/me/subscriptions/${res.json().id}`, headers: B.auth })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/me/subscriptions', headers: B.auth })).json().items).toEqual([]);
  });

  it('валидация и лимит 5 подписок (в том числе при параллельных запросах)', async () => {
    expect((await subscribe(B, { region_code: 'Простоквашино' })).json().error.fields).toHaveProperty('region_code');
    expect((await subscribe(B, { salary_from: -1 })).statusCode).toBe(400);
    expect((await subscribe(B, { user_id: A.user.id })).statusCode).toBe(400);

    const results = await Promise.all(Array.from({ length: 8 }, () => subscribe(B, {})));
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(5);
    const rejected = results.filter((r) => r.statusCode === 409);
    expect(rejected).toHaveLength(3);
    expect(rejected[0].json().error.code).toBe('subscription_limit_reached');
  });
});

describe('рассылка при публикации', () => {
  it('подходящим подписчикам — карточка с кнопками, остальным ничего', async () => {
    const D = await createUser('D');
    const E = await createUser('E');
    const F = await createUser('F');
    await subscribe(B, { region_code: '23' });
    await subscribe(C, {}); // нет личного чата
    await subscribe(D, { region_code: '16' }); // другой регион
    await subscribe(E, { salary_from: 5000 }); // зарплата ниже
    await subscribe(F, { student_only: true }); // вакансия не для студентов
    await subscribe(A, {}); // сам работодатель

    const id = await publish({ region_code: 'Краснодар', salary_min: 3000, salary_max: 4000 });
    await vi.waitFor(() => expect(noticesTo('chat-B')).toHaveLength(1));
    const [, text, buttons] = noticesTo('chat-B')[0];
    expect(text).toContain(`start=apply_${id}_sub`);
    expect((buttons as { payload: string }[][]).map((row) => row[0].payload)).toEqual([`apply:${id}:sub`, expect.stringMatching(/^unsub:\d+$/)]);
    for (const chat of ['chat-D', 'chat-E', 'chat-F', 'chat-A']) expect(noticesTo(chat)).toHaveLength(0);
    expect(await db.subscriptionDelivery.count()).toBe(1);
  });

  it('несколько подходящих подписок — одно сообщение; повторный запуск рассылки — без дублей', async () => {
    await subscribe(B, {});
    await subscribe(B, { region_code: '23' });
    const id = await publish({ region_code: 'Краснодар' });
    await vi.waitFor(() => expect(noticesTo('chat-B')).toHaveLength(1));
    await Promise.all([notifySubscribers(id), notifySubscribers(id)]);
    expect(noticesTo('chat-B')).toHaveLength(1);
  });

  it('уже откликнувшимся не присылаем; студентам — только отмеченные вакансии', async () => {
    await subscribe(B, { student_only: true });
    const id = await publish({ student_friendly: true });
    await vi.waitFor(() => expect(noticesTo('chat-B')).toHaveLength(1));
    const other = await publish({ student_friendly: false, title: 'Другая' });
    await notifySubscribers(other);
    expect(noticesTo('chat-B')).toHaveLength(1);
    expect(id).toBeGreaterThan(0);
  });

  it('отклик из рассылки помечается источником subscription; отписка кнопкой', async () => {
    const sub = (await subscribe(B, {})).json();
    const id = await publish({});
    await vi.waitFor(() => expect(noticesTo('chat-B')).toHaveLength(1));

    await press(B, `apply:${id}:sub`);
    await message(B, '+7 900 000-00-00');
    expect((await db.application.findFirstOrThrow({ where: { vacancyId: id } })).source).toBe('subscription');

    await press(B, `unsub:${sub.id}`);
    expect(await db.jobSubscription.count()).toBe(0);
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('Подписка отменена');
  });
});

describe('подписка из бота', () => {
  it('«Присылать похожие» после отклика и /отписаться', async () => {
    const id = await publish({ region_code: 'Краснодар', category: 'agro' });
    await press(B, `apply:${id}`);
    await message(B, '+7 900 000-00-00');
    const confirmation = sentTo('chat-B').at(-1)!;
    expect(confirmation[2]).toEqual([[{ type: 'callback', text: 'Присылать похожие вакансии', payload: `subscribe_like:${id}` }]]);

    await press(B, `subscribe_like:${id}`);
    expect(await db.jobSubscription.findFirst({ where: { userId: B.user.id } })).toMatchObject({ regionSubject: '23', category: 'agro' });
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('Краснодарский край');

    await press(B, `subscribe_like:${id}`);
    expect(await db.jobSubscription.count()).toBe(1);
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('уже подписаны');

    await message(B, '/отписаться');
    expect(await db.jobSubscription.count()).toBe(0);
  });
});
