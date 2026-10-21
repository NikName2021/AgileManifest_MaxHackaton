import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { createUser, resetDb, sendMessageMock, sentTo, type TestUser } from './helpers.js';

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
const workers: TestUser[] = [];

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  workers.length = 0;
  for (const name of ['W1', 'W2', 'W3', 'W4', 'W5']) workers.push(await createUser(name));
});

async function vacancy(headcount: number | null) {
  const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Сбор', headcount } });
  expect(created.statusCode).toBe(201);
  const id = created.json().id as number;
  await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: A.auth });
  return id;
}

async function apply(user: TestUser, vacancyId: number) {
  return (await app.inject({ method: 'POST', url: '/api/applications', headers: user.auth, payload: { vacancy_id: vacancyId, contact: '+7 900 111-22-33' } })).json().id as number;
}

function setStatus(applicationId: number, status: string) {
  return app.inject({ method: 'PATCH', url: `/api/applications/${applicationId}`, headers: A.auth, payload: { status } });
}

describe('набор бригады (headcount)', () => {
  it('карточка и каталог показывают, сколько мест осталось', async () => {
    const id = await vacancy(3);
    const card = sendMessageMock.mock.calls.find((c) => c[0] === 'chat-A' && String(c[1]).includes('Сбор'));
    expect(card?.[1]).toContain('Набор: 3 человека');

    const first = await apply(workers[0], id);
    await setStatus(first, 'hired');
    const job = (await app.inject({ method: 'GET', url: `/api/jobs/${id}`, headers: workers[1].auth })).json();
    expect(job).toMatchObject({ headcount: 3, spotsLeft: 2 });

    const noLimit = await vacancy(null);
    expect((await app.inject({ method: 'GET', url: `/api/jobs/${noLimit}`, headers: workers[1].auth })).json()).toMatchObject({ headcount: null, spotsLeft: null });
  });

  it('последний найм закрывает вакансию, ожидающим уходит вежливый отказ, приглашённых не трогаем', async () => {
    const id = await vacancy(2);
    const [a1, a2, a3, a4, a5] = await Promise.all(workers.map((w) => apply(w, id)));
    await setStatus(a3, 'contacted');
    await setStatus(a4, 'invited');
    await setStatus(a1, 'hired');
    sendMessageMock.mockClear();

    const res = await setStatus(a2, 'hired');
    expect(res.json()).toMatchObject({ status: 'hired', vacancyClosed: true });
    expect((await db.vacancy.findUniqueOrThrow({ where: { id } })).status).toBe('closed');

    const statuses = Object.fromEntries((await db.application.findMany({ where: { vacancyId: id } })).map((a) => [a.id, a.status]));
    expect(statuses).toEqual({ [a1]: 'hired', [a2]: 'hired', [a3]: 'rejected', [a4]: 'invited', [a5]: 'rejected' });

    for (const name of ['W3', 'W5']) expect(sentTo(`chat-${name}`).at(-1)?.[1]).toContain('Набор уже закрыт');
    expect(sentTo('chat-W4')).toHaveLength(0);
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('все 2 мест заняты');

    // Новые отклики на закрытую вакансию не принимаются.
    const late = await createUser('Late');
    const lateRes = await app.inject({ method: 'POST', url: '/api/applications', headers: late.auth, payload: { vacancy_id: id, contact: '+7 900 111-22-33' } });
    expect(lateRes.json().error.code).toBe('vacancy_unavailable');
  });

  it('без headcount вакансия не закрывается сама', async () => {
    const id = await vacancy(null);
    const a = await apply(workers[0], id);
    expect((await setStatus(a, 'hired')).json().vacancyClosed).toBe(false);
    expect((await db.vacancy.findUniqueOrThrow({ where: { id } })).status).toBe('published');
  });

  it('одновременные наймы закрывают вакансию и рассылают отказы один раз', async () => {
    const id = await vacancy(2);
    const apps = await Promise.all(workers.map((w) => apply(w, id)));
    sendMessageMock.mockClear();
    const results = await Promise.all([setStatus(apps[0], 'hired'), setStatus(apps[1], 'hired'), setStatus(apps[2], 'hired')]);
    expect(results.filter((r) => r.json().vacancyClosed)).toHaveLength(1);
    expect(sentTo('chat-A').filter((c) => String(c[1]).includes('Набор на'))).toHaveLength(1);
  });

  it('валидация headcount', async () => {
    for (const headcount of [0, -1, 1001, 2.5, '5']) {
      const res = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'x', headcount } });
      expect(res.statusCode, JSON.stringify(headcount)).toBe(400);
      expect(res.json().error.fields).toHaveProperty('headcount');
    }
  });
});

describe('подходит студентам', () => {
  it('отметка видна в карточке и каталоге, фильтр student_friendly', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Вожатый', student_friendly: true } });
    const id = created.json().id as number;
    expect(created.json().studentFriendly).toBe(true);
    await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: A.auth });
    await vacancy(null);
    const card = sendMessageMock.mock.calls.find((c) => String(c[1]).includes('Вожатый'));
    expect(card?.[1]).toContain('Подходит студентам');

    const students = (await app.inject({ method: 'GET', url: '/api/jobs?student_friendly=true', headers: workers[0].auth })).json();
    expect(students.items.map((j: { id: number }) => j.id)).toEqual([id]);
    expect(students.items[0].studentFriendly).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/jobs?student_friendly=false', headers: workers[0].auth })).json().total).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/api/jobs', headers: workers[0].auth })).json().total).toBe(2);
    expect((await app.inject({ method: 'GET', url: '/api/jobs?student_friendly=yes', headers: workers[0].auth })).statusCode).toBe(400);
  });
});
