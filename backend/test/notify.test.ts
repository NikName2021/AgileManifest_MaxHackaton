import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { CANDIDATE_NOTIFY_COOLDOWN_MS, sendPendingCandidateNotificationsOnce } from '../src/application/notify.js';
import { createUser, maxApiMock, resetDb, sendMessageMock, sentTo, webhookHeaders, type TestUser } from './helpers.js';

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

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  maxApiMock.sendMessageToUser.mockClear();
  A = await createUser('A');
  B = await createUser('B');
});

async function applied(candidate: TestUser = B) {
  const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Бариста', region_code: 'Сочи' } });
  const vacancyId = created.json().id as number;
  await app.inject({ method: 'POST', url: `/api/vacancies/${vacancyId}/publish`, headers: A.auth });
  const application = await app.inject({ method: 'POST', url: '/api/applications', headers: candidate.auth, payload: { vacancy_id: vacancyId, contact: '+7 900 111-22-33' } });
  await settleBroadcasts();
  sendMessageMock.mockClear();
  return application.json().id as number;
}

const setStatus = (id: number, status: string) =>
  app.inject({ method: 'PATCH', url: `/api/applications/${id}`, headers: A.auth, payload: { status } });

const pressInEmployerChat = (payload: string) =>
  app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: { update_type: 'message_callback', message: { recipient: { chat_id: 'chat-A' } }, callback: { callback_id: 'cb', payload, user: { user_id: 'max-A' } } },
  });

const later = (ms: number) => new Date(Date.now() + ms);

describe('уведомления кандидату об этапах', () => {
  it('«На связи» и «Просмотрено» тоже приходят в бота; «просмотрено» — один раз и фоном', async () => {
    const id = await applied();

    // Работодатель открыл список — сообщение уходит обработкой отложенных, не в ответе API.
    await app.inject({ method: 'GET', url: '/api/applications', headers: A.auth });
    expect(sentTo('chat-B')).toHaveLength(0);
    expect(await sendPendingCandidateNotificationsOnce(later(1000))).toBe(1);
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('посмотрел ваш отклик');
    await app.inject({ method: 'GET', url: '/api/applications', headers: A.auth });
    expect(await sendPendingCandidateNotificationsOnce(later(2000))).toBe(0);

    const res = await setStatus(id, 'contacted');
    // Окно антиспама после «посмотрел» ещё идёт — «На связи» отложено.
    expect(res.json()).toMatchObject({ notified: false, notification: 'deferred' });
    expect(await sendPendingCandidateNotificationsOnce(later(CANDIDATE_NOTIFY_COOLDOWN_MS + 1000))).toBe(1);
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('вышел на связь');
    expect(sentTo('chat-B')).toHaveLength(2);
  });

  it('антиспам: при частых сменах этапа — одно итоговое сообщение; вернули уже сообщённый этап — ничего', async () => {
    const id = await applied();
    expect((await setStatus(id, 'invited')).json()).toMatchObject({ notified: true, notification: 'sent', notifyAt: null });
    // Вернули «Приглашён», о котором кандидат уже знает, — отложенное сообщение снимается (none).
    for (const [status, expected] of [['contacted', 'deferred'], ['invited', 'none'], ['contacted', 'deferred'], ['hired', 'deferred']]) {
      const res = (await setStatus(id, status)).json();
      expect(res.notification, status).toBe(expected);
    }
    expect(sentTo('chat-B')).toHaveLength(1);
    // До конца окна ничего не уходит, после — одно сообщение с итоговым этапом.
    expect(await sendPendingCandidateNotificationsOnce(later(30_000))).toBe(0);
    expect(await sendPendingCandidateNotificationsOnce(later(CANDIDATE_NOTIFY_COOLDOWN_MS + 1000))).toBe(1);
    expect(sentTo('chat-B')).toHaveLength(2);
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('Вас приняли');

    // Вернули этап, о котором кандидат уже знает, — сообщения нет.
    await setStatus(id, 'invited');
    await setStatus(id, 'hired');
    expect(await sendPendingCandidateNotificationsOnce(later(3 * CANDIDATE_NOTIFY_COOLDOWN_MS))).toBe(0);
    expect(sentTo('chat-B')).toHaveLength(2);
  });

  it('работодатель в чате видит понятную причину, а не «не удалось уведомить»', async () => {
    const C = await createUser('C', { dialogChatId: null });
    const id = await applied(C);
    await pressInEmployerChat(`app_status:${id}:contacted`);
    expect(sentTo('chat-A').at(-1)?.[1]).toBe(
      'Статус обновлён: На связи. Кандидат не запускал бота в MAX, поэтому сообщение ему не доставить — свяжитесь с ним по контакту из отклика.'
    );

    const id2 = await applied();
    await pressInEmployerChat(`app_status:${id2}:contacted`);
    expect(sentTo('chat-A').at(-1)?.[1]).toBe('Статус обновлён: На связи.');
    await pressInEmployerChat(`app_status:${id2}:invited`);
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('придёт одно сообщение с итоговым этапом');
  });

  it('без личного чата с ботом пишем по user_id из MAX', async () => {
    const D = await createUser('D', { dialogChatId: null });
    await db.user.update({ where: { id: D.user.id }, data: { maxUserId: '123456' } });
    const id = await applied(D);
    expect((await setStatus(id, 'invited')).json()).toMatchObject({ notification: 'sent' });
    expect(maxApiMock.sendMessageToUser).toHaveBeenCalledWith('123456', expect.stringContaining('Вас пригласили'));
  });

  it('«Новый» вручную не ставится — ни через API, ни кнопкой в чате', async () => {
    const id = await applied();
    await setStatus(id, 'contacted');
    const res = await setStatus(id, 'new');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toHaveProperty('status');
    await pressInEmployerChat(`app_status:${id}:new`);
    expect((await db.application.findUniqueOrThrow({ where: { id } })).status).toBe('contacted');
  });
});
