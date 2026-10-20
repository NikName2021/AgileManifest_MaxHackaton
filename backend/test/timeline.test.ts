import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { createUser, resetDb, sendMessageMock, webhookHeaders, type TestUser } from './helpers.js';

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await settleBroadcasts();
  await app.close();
  await db.$disconnect();
});

let A: TestUser;
let B: TestUser;
let vacancyId: number;
let appId: number;

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  B = await createUser('B');
  vacancyId = (await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Сбор черешни' } })).json().id;
  await app.inject({ method: 'POST', url: `/api/vacancies/${vacancyId}/publish`, headers: A.auth });
  appId = (await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: vacancyId, contact: '+7' } })).json().id;
});

async function timeline(user: TestUser = B) {
  const res = await app.inject({ method: 'GET', url: `/api/applications/${appId}/timeline`, headers: user.auth });
  return res.json();
}

const states = (t: any) => Object.fromEntries(t.steps.map((s: any) => [s.key, s.state]));
const setStatus = (status: string) => app.inject({ method: 'PATCH', url: `/api/applications/${appId}`, headers: A.auth, payload: { status } });

function press(payload: string, user: TestUser = B) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: { update_type: 'message_callback', message: { recipient: { chat_id: user.user.chatId } }, callback: { callback_id: 'cb', payload, user: { user_id: user.user.maxUserId } } },
  });
}

describe('дорожная карта отклика', () => {
  it('только что откликнулся: первый этап текущий и со временем, остальные впереди', async () => {
    const t = await timeline();
    expect(t.current).toBe('applied');
    expect(t.outcome).toBeNull();
    expect(t.steps.map((s: any) => s.key)).toEqual(['applied', 'viewed', 'contacted', 'invited', 'shift_confirmed', 'hired']);
    expect(t.steps[0]).toMatchObject({ key: 'applied', emoji: '📨', label: 'Отклик отправлен', state: 'current', reachedAt: expect.any(String) });
    expect(t.steps.slice(1).every((s: any) => s.state === 'upcoming' && s.reachedAt === null)).toBe(true);
  });

  it('работодатель открыл список откликов — этап «посмотрел», время не меняется при повторном просмотре', async () => {
    await app.inject({ method: 'GET', url: '/api/applications', headers: A.auth });
    const first = await timeline();
    expect(first.current).toBe('viewed');
    expect(states(first)).toMatchObject({ applied: 'done', viewed: 'current' });
    const viewedAt = first.steps[1].reachedAt;
    await app.inject({ method: 'GET', url: `/api/vacancies/${vacancyId}/applications`, headers: A.auth });
    expect((await timeline()).steps[1].reachedAt).toBe(viewedAt);
  });

  it('полный путь до найма: все этапы пройдены по порядку, итог «нанят»', async () => {
    await setStatus('contacted');
    await setStatus('invited');
    await app.inject({ method: 'PATCH', url: `/api/applications/${appId}/shift`, headers: A.auth, payload: { start_at: new Date(Date.now() + 864e5).toISOString() } });
    await press(`attend:${appId}:yes`);
    expect((await timeline()).current).toBe('shift_confirmed');
    await setStatus('hired');

    const t = await timeline();
    expect(t.current).toBe('hired');
    expect(Object.values(states(t))).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
    expect(t.outcome).toMatchObject({ key: 'hired', emoji: '🎉', reachedAt: expect.any(String) });
    const times = t.steps.map((s: any) => Date.parse(s.reachedAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('сразу «Нанят» — промежуточные этапы пропущены, «посмотрел» засчитан по смене этапа (в том числе кнопкой в чате)', async () => {
    await press(`app_status:${appId}:hired`, A);
    const t = await timeline();
    expect(states(t)).toEqual({ applied: 'done', viewed: 'done', contacted: 'skipped', invited: 'skipped', shift_confirmed: 'skipped', hired: 'done' });
    expect(t.steps.find((s: any) => s.key === 'contacted').reachedAt).toBeNull();
  });

  it('отказ — итог «отказ» со временем', async () => {
    await setStatus('contacted');
    await setStatus('rejected');
    const t = await timeline();
    expect(t.outcome).toMatchObject({ key: 'rejected', emoji: '❌', reachedAt: expect.any(String) });
    expect(t.current).toBe('viewed');
  });

  it('этап вернули назад — дорожная карта тоже откатывается', async () => {
    await setStatus('invited');
    await setStatus('contacted');
    const t = await timeline();
    expect(t.current).toBe('contacted');
    expect(states(t).invited).toBe('upcoming');
  });

  it('вакансию закрыли — итог «набор закрыт» со временем закрытия', async () => {
    await app.inject({ method: 'POST', url: `/api/vacancies/${vacancyId}/close`, headers: A.auth });
    const t = await timeline();
    expect(t.outcome).toMatchObject({ key: 'vacancy_closed', emoji: '🔒', reachedAt: expect.any(String) });
  });

  it('видят кандидат и работодатель, остальные — нет; история кандидата содержит дорожную карту', async () => {
    expect((await timeline(A)).current).toBe('applied');
    const C = await createUser('C');
    expect((await app.inject({ method: 'GET', url: `/api/applications/${appId}/timeline`, headers: C.auth })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/applications/999999/timeline', headers: B.auth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/applications/${appId}/timeline` })).statusCode).toBe(401);

    const history = (await app.inject({ method: 'GET', url: '/api/me/applications', headers: B.auth })).json();
    expect(history.items[0].timeline).toEqual(await timeline());
  });

  it('повтор того же этапа не создаёт новое событие', async () => {
    await setStatus('contacted');
    await setStatus('contacted');
    expect(await db.applicationEvent.count({ where: { applicationId: appId, type: 'status:contacted' } })).toBe(1);
  });
});
