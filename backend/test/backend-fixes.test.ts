import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/trudvsem/client.js', () => ({ searchTrudvsemVacancies: vi.fn(async () => []) }));
vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { findOrCreateUserByMaxId } from '../src/users/service.js';
import { checkStaleVacanciesOnce } from '../src/vacancies/reminders.js';
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

async function publishedVacancy(owner: TestUser) {
  const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: owner.auth, payload: { title: 'Повар', region_code: '23' } });
  const { id } = created.json();
  const res = await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: owner.auth });
  expect(res.statusCode).toBe(200);
  return id as number;
}

function groupMessage(user: TestUser, chatId: string, text: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: {
      update_type: 'message_created',
      message: { recipient: { chat_id: chatId }, sender: { user_id: user.user.maxUserId, name: user.user.displayName }, body: { text } },
    },
  });
}

describe('некорректный :id в маршрутах работодателя', () => {
  it('400 validation_error вместо 500', async () => {
    const routes: [string, string, object?][] = [
      ['GET', '/api/vacancies/abc'],
      ['PATCH', '/api/vacancies/abc', { title: 'x' }],
      ['POST', '/api/vacancies/abc/publish'],
      ['POST', '/api/vacancies/abc/close'],
      ['GET', '/api/vacancies/abc/applications'],
      ['PATCH', '/api/applications/abc', { status: 'invited' }],
      ['GET', '/api/vacancies/0'],
      ['GET', '/api/vacancies/99999999999'],
    ];
    for (const [method, url, payload] of routes) {
      const res = await app.inject({ method: method as 'GET', url, headers: A.auth, payload });
      expect(res.statusCode, `${method} ${url}`).toBe(400);
      expect(res.json().error.code).toBe('validation_error');
    }
  });
});

describe('валидация зарплаты', () => {
  it('строка вместо числа не превращается в 0', async () => {
    for (const salary of ['', '50000', true]) {
      const res = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'x', salary_min: salary } });
      expect(res.statusCode, JSON.stringify(salary)).toBe(400);
      expect(res.json().error.fields).toHaveProperty('salary_min');
    }
    const ok = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'x', salary_min: 0, salary_max: null } });
    expect(ok.json()).toMatchObject({ salaryMin: 0, salaryMax: null });
  });
});

describe('данные кандидата в API работодателя', () => {
  it('не раскрывают чаты и сохранённый контакт кандидата, контракт фронтенда сохранён', async () => {
    const id = await publishedVacancy(A);
    await db.user.update({ where: { id: B.user.id }, data: { applicationContact: '@private_contact' } });
    const created = (await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: id, contact: '+7 900 111-22-33' } })).json();

    const list = (await app.inject({ method: 'GET', url: '/api/applications', headers: A.auth })).json();
    const byVacancy = (await app.inject({ method: 'GET', url: `/api/vacancies/${id}/applications`, headers: A.auth })).json();
    const patched = (await app.inject({ method: 'PATCH', url: `/api/applications/${created.id}`, headers: A.auth, payload: { status: 'contacted' } })).json();

    const summary = { id: B.user.id, maxUserId: 'max-B', displayName: 'B', phone: null };
    expect(list.items[0].candidate).toEqual(summary);
    expect(byVacancy[0].candidate).toEqual(summary);
    expect(patched.candidate).toEqual(summary);
    expect(patched.vacancy).toEqual({ id, title: 'Повар', status: 'published' });
    expect(patched).toMatchObject({ id: created.id, vacancyId: id, candidateUserId: B.user.id, status: 'contacted', notified: false, unchanged: false });

    const raw = JSON.stringify([list, byVacancy, patched]);
    for (const leaked of ['dialogChatId', 'applicationContact', '@private_contact', '"chatId"']) {
      expect(raw).not.toContain(leaked);
    }
  });
});

describe('смена статуса', () => {
  it('параллельные одинаковые смены: одна запись и одно уведомление кандидату', async () => {
    const id = await publishedVacancy(A);
    const created = (await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: id, contact: '+7 900 111-22-33' } })).json();
    sendMessageMock.mockClear();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => app.inject({ method: 'PATCH', url: `/api/applications/${created.id}`, headers: A.auth, payload: { status: 'invited' } }))
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(results.filter((r) => r.json().unchanged === false)).toHaveLength(1);
    expect(sentTo('chat-B')).toHaveLength(1);
  });
});

describe('вход через мини-приложение', () => {
  it('одновременный первый вход одного пользователя не падает и не создаёт дубль', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => findOrCreateUserByMaxId('max-new', 'Новый')));
    expect(new Set(users.map((u) => u.id)).size).toBe(1);
    expect(await db.user.count({ where: { maxUserId: 'max-new' } })).toBe(1);
    const renamed = await findOrCreateUserByMaxId('max-new', 'Новое имя');
    expect(renamed).toMatchObject({ id: users[0].id, displayName: 'Новое имя', chatId: '' });
  });
});

describe('диалог создания вакансии в групповом чате', () => {
  it('чужие ответы не продвигают диалог, вакансия записывается на начавшего', async () => {
    const group = 'group-1';
    await groupMessage(A, group, '/новая_вакансия');
    // B пишет в ту же группу — это не ответ на вопрос A.
    await groupMessage(B, group, 'Чужой ответ');
    expect((await db.dialogSession.findUniqueOrThrow({ where: { chatId: group } })).step).toBe(0);

    for (const answer of ['Сборщик', 'Краснодар', 'seasonal', '40000-60000', 'нет', '+7 900 111-22-33']) {
      await groupMessage(A, group, answer);
      // B последним писал в группу — по старой логике (findFirst по chatId) вакансия могла уйти ему.
      await db.user.update({ where: { id: B.user.id }, data: { chatId: group } });
    }
    const vacancy = await db.vacancy.findFirstOrThrow({ where: { title: 'Сборщик' } });
    expect(vacancy.employerUserId).toBe(A.user.id);
    expect(vacancy).toMatchObject({ regionCode: 'Краснодар', schedule: 'seasonal', salaryMin: 40000, salaryMax: 60000, status: 'draft', regionSubject: '23' });
  });
});

describe('напоминание о вакансии без откликов', () => {
  it('считает 48 часов от публикации, а не от создания черновика', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Старый черновик' } });
    const id = created.json().id;
    await db.vacancy.update({ where: { id }, data: { createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000) } });
    await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: A.auth });
    sendMessageMock.mockClear();

    expect(await checkStaleVacanciesOnce()).toBe(0);

    await db.vacancy.update({ where: { id }, data: { publishedAt: new Date(Date.now() - 49 * 3600 * 1000) } });
    expect(await checkStaleVacanciesOnce()).toBe(1);
    expect(sentTo('chat-A')).toHaveLength(1);
  });
});

describe('секрет вебхука', () => {
  it('неверный или отсутствующий заголовок -> 401, верный -> 200', async () => {
    const body = { update_type: 'bot_started', chat_id: 'x', user: { user_id: 'max-A' }, payload: '' };
    for (const headers of [{}, { 'x-max-bot-api-secret': 'wrong' }, { 'x-max-bot-api-secret': 'test-webhook-secret-but-longer' }]) {
      const res = await app.inject({ method: 'POST', url: '/webhook/max', headers, payload: body });
      expect(res.statusCode).toBe(401);
    }
    const ok = await app.inject({ method: 'POST', url: '/webhook/max', headers: webhookHeaders(), payload: body });
    expect(ok.statusCode).toBe(200);
  });
});
