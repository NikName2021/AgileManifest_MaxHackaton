import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { employerTrust } from '../src/employers/trust.js';
import { TRUSTED_LINE } from '../src/vacancies/cardText.js';
import { createUser, resetDb, sendMessageMock, webhookHeaders, type TestUser } from './helpers.js';

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
let workers: TestUser[];

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  workers = [];
  for (let i = 1; i <= 6; i++) workers.push(await createUser(`W${i}`));
});

async function publish(owner: TestUser, title: string) {
  const id = (await app.inject({ method: 'POST', url: '/api/vacancies', headers: owner.auth, payload: { title } })).json().id as number;
  await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: owner.auth });
  return id;
}

// Найм с подтверждённым выходом — напрямую в БД (полный путь через API проверяется отдельно).
async function confirmedHire(vacancyId: number, user: TestUser, attendance: string | null = 'confirmed') {
  await db.application.create({
    data: { vacancyId, candidateUserId: user.user.id, status: 'hired', contact: '+7', attendance, startAt: new Date() },
  });
}

describe('надёжный работодатель', () => {
  it('5 разных людей подтвердили выход — отметка в каталоге, профиле и карточке', async () => {
    const v1 = await publish(A, 'Сбор черешни');
    const v2 = await publish(A, 'Сбор абрикосов');
    for (const w of workers.slice(0, 3)) await confirmedHire(v1, w);
    for (const w of workers.slice(3, 5)) await confirmedHire(v2, w);

    expect(await employerTrust(A.user.id)).toEqual({ trusted: true, confirmedHires: 5 });

    const viewer = workers[5];
    const job = (await app.inject({ method: 'GET', url: `/api/jobs/${v1}`, headers: viewer.auth })).json();
    expect(job.employer).toEqual({ displayName: 'A', trusted: true, confirmedHires: 5 });
    const list = (await app.inject({ method: 'GET', url: '/api/jobs', headers: viewer.auth })).json();
    expect(list.items.every((j: { employer: { trusted: boolean } }) => j.employer.trusted)).toBe(true);

    const me = (await app.inject({ method: 'GET', url: '/api/me', headers: A.auth })).json();
    expect(me.employerTrust).toEqual({ trusted: true, confirmedHires: 5, threshold: 5 });

    sendMessageMock.mockClear();
    const v3 = await publish(A, 'Сбор слив');
    const card = sendMessageMock.mock.calls.find((c) => String(c[1]).includes('Сбор слив'));
    expect(card?.[1]).toContain(TRUSTED_LINE);
    expect(v3).toBeGreaterThan(0);

    // История откликов кандидата тоже показывает отметку.
    const history = (await app.inject({ method: 'GET', url: '/api/me/applications', headers: workers[0].auth })).json();
    expect(history.items[0].vacancy.employer).toEqual({ displayName: 'A', trusted: true, confirmedHires: 5 });
  });

  it('накрутка не работает: неподтверждённые, повторы, сам себе, без чата с ботом; одной вакансии достаточно', async () => {
    const v1 = await publish(A, 'Сбор 1');
    const v2 = await publish(A, 'Сбор 2');
    await confirmedHire(v1, workers[0]);
    await confirmedHire(v2, workers[0]); // тот же человек второй раз — один подтверждённый найм
    await confirmedHire(v1, workers[1], null); // нанят, но выход не подтверждал
    await confirmedHire(v1, workers[2], 'declined');
    const ghost = await createUser('Ghost', { chatId: '', dialogChatId: null });
    await confirmedHire(v1, ghost); // нет личного чата с ботом — не реальный подтверждённый человек
    await confirmedHire(v1, A); // сам себя
    expect(await employerTrust(A.user.id)).toEqual({ trusted: false, confirmedHires: 1 });

    // Одной вакансии достаточно: кафе нанимает только бариста.
    const B = await createUser('B');
    const single = await publish(B, 'Бариста');
    for (const w of workers.slice(0, 4)) await confirmedHire(single, w);
    expect(await employerTrust(B.user.id)).toEqual({ trusted: false, confirmedHires: 4 });
    await confirmedHire(single, workers[4]);
    expect(await employerTrust(B.user.id)).toEqual({ trusted: true, confirmedHires: 5 });
    const job = (await app.inject({ method: 'GET', url: `/api/jobs/${single}`, headers: workers[5].auth })).json();
    expect(job.employer).toMatchObject({ trusted: true, confirmedHires: 5 });
  });

  it('полный путь: найм -> назначение смены -> «Приду» засчитывается; снятие найма убирает его', async () => {
    const v = await publish(A, 'Сбор');
    const appId = (await app.inject({ method: 'POST', url: '/api/applications', headers: workers[0].auth, payload: { vacancy_id: v, contact: '+7' } })).json().id;
    await app.inject({ method: 'PATCH', url: `/api/applications/${appId}`, headers: A.auth, payload: { status: 'hired' } });
    expect((await employerTrust(A.user.id)).confirmedHires).toBe(0);

    await app.inject({ method: 'PATCH', url: `/api/applications/${appId}/shift`, headers: A.auth, payload: { start_at: new Date(Date.now() + 864e5).toISOString() } });
    await app.inject({
      method: 'POST',
      url: '/webhook/max',
      headers: webhookHeaders(),
      payload: { update_type: 'message_callback', message: { recipient: { chat_id: 'chat-W1' } }, callback: { callback_id: 'cb', payload: `attend:${appId}:yes`, user: { user_id: 'max-W1' } } },
    });
    expect((await employerTrust(A.user.id)).confirmedHires).toBe(1);

    await app.inject({ method: 'PATCH', url: `/api/applications/${appId}`, headers: A.auth, payload: { status: 'rejected' } });
    expect((await employerTrust(A.user.id)).confirmedHires).toBe(0);
  });

  it('без наймов — отметки нет, в карточке строки нет', async () => {
    sendMessageMock.mockClear();
    const v = await publish(A, 'Новичок');
    const card = sendMessageMock.mock.calls.find((c) => String(c[1]).includes('Новичок'));
    expect(card?.[1]).not.toContain(TRUSTED_LINE);
    const job = (await app.inject({ method: 'GET', url: `/api/jobs/${v}`, headers: workers[0].auth })).json();
    expect(job.employer).toEqual({ displayName: 'A', trusted: false, confirmedHires: 0 });
  });
});
