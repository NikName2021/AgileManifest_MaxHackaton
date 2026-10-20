import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { formatShiftTime, sendShiftRemindersOnce } from '../src/shifts/service.js';
import { createUser, resetDb, sendMessageMock, sentTo, webhookHeaders, type TestUser } from './helpers.js';

beforeAll(async () => {
  setBotUsername('season_test_bot');
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

let A: TestUser;
let B: TestUser;
let C: TestUser;
let vacancyId: number;
let appB: number;

const inHours = (h: number) => new Date(Date.now() + h * 3600 * 1000);

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  B = await createUser('B');
  C = await createUser('C');
  const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Сбор черешни' } });
  vacancyId = created.json().id;
  await app.inject({ method: 'POST', url: `/api/vacancies/${vacancyId}/publish`, headers: A.auth });
  appB = (await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: vacancyId, contact: '+7' } })).json().id;
  await app.inject({ method: 'POST', url: '/api/applications', headers: C.auth, payload: { vacancy_id: vacancyId, contact: '+7' } });
  await app.inject({ method: 'PATCH', url: `/api/applications/${appB}`, headers: A.auth, payload: { status: 'invited' } });
  sendMessageMock.mockClear();
});

function setShift(user: TestUser, id: number, payload: object) {
  return app.inject({ method: 'PATCH', url: `/api/applications/${id}/shift`, headers: user.auth, payload });
}

function press(user: TestUser, payload: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: { update_type: 'message_callback', message: { recipient: { chat_id: user.user.chatId } }, callback: { callback_id: 'cb', payload, user: { user_id: user.user.maxUserId } } },
  });
}

describe('выход на смену', () => {
  it('работодатель назначает время — кандидат сразу получает сообщение с кнопками', async () => {
    const startAt = inHours(48);
    const res = await setShift(A, appB, { start_at: startAt.toISOString(), note: 'ул. Садовая 5, перчатки' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: appB, startAt: startAt.toISOString(), shiftNote: 'ул. Садовая 5, перчатки', attendance: 'pending', notified: true });

    const [, text, buttons] = sentTo('chat-B').at(-1)!;
    expect(text).toContain('Сбор черешни');
    expect(text).toContain(formatShiftTime(startAt));
    expect(text).toContain('Садовая 5');
    expect(buttons).toEqual([[
      { type: 'callback', text: 'Приду', payload: `attend:${appB}:yes` },
      { type: 'callback', text: 'Не смогу', payload: `attend:${appB}:no` },
    ]]);

    const history = (await app.inject({ method: 'GET', url: '/api/me/applications', headers: B.auth })).json();
    expect(history.items[0]).toMatchObject({ startAt: startAt.toISOString(), shiftNote: 'ул. Садовая 5, перчатки', attendance: 'pending' });
  });

  it('«Приду» и «Не смогу» доходят до работодателя; повтор того же ответа ничего не шлёт', async () => {
    await setShift(A, appB, { start_at: inHours(30).toISOString() });
    sendMessageMock.mockClear();

    await press(B, `attend:${appB}:yes`);
    expect((await db.application.findUniqueOrThrow({ where: { id: appB } })).attendance).toBe('confirmed');
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('подтвердил(а) выход');

    sendMessageMock.mockClear();
    await press(B, `attend:${appB}:yes`);
    expect(sentTo('chat-A')).toHaveLength(0);
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('уже сохранён');

    await press(B, `attend:${appB}:no`);
    expect((await db.application.findUniqueOrThrow({ where: { id: appB } })).attendance).toBe('declined');
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('не сможет выйти');
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('ещё 1 кандидатов');
  });

  it('чужое нажатие игнорируется', async () => {
    await setShift(A, appB, { start_at: inHours(30).toISOString() });
    sendMessageMock.mockClear();
    await press(C, `attend:${appB}:yes`);
    expect((await db.application.findUniqueOrThrow({ where: { id: appB } })).attendance).toBe('pending');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('напоминание накануне — один раз и только не ответившим', async () => {
    await setShift(A, appB, { start_at: inHours(40).toISOString() });
    sendMessageMock.mockClear();
    expect(await sendShiftRemindersOnce()).toBe(0); // ещё рано

    const later = new Date(Date.now() + 25 * 3600 * 1000);
    expect(await sendShiftRemindersOnce(later)).toBe(1);
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('Напоминаем');
    expect(await sendShiftRemindersOnce(later)).toBe(0);

    // Новое время — новое напоминание; ответившим не напоминаем.
    await setShift(A, appB, { start_at: inHours(50).toISOString() });
    await press(B, `attend:${appB}:yes`);
    expect(await sendShiftRemindersOnce(new Date(Date.now() + 40 * 3600 * 1000))).toBe(0);
  });

  it('сбой доставки напоминания — повтор в следующий прогон', async () => {
    await setShift(A, appB, { start_at: inHours(10).toISOString() });
    sendMessageMock.mockRejectedValueOnce(new Error('MAX 500'));
    expect(await sendShiftRemindersOnce()).toBe(0);
    expect(await sendShiftRemindersOnce()).toBe(1);
  });

  it('проверки: только свои, только приглашённые/нанятые, не в прошлом; null снимает назначение', async () => {
    const appC = (await db.application.findFirstOrThrow({ where: { candidateUserId: C.user.id } })).id;
    expect((await setShift(A, appC, { start_at: inHours(30).toISOString() })).statusCode).toBe(409); // статус new
    expect((await setShift(B, appB, { start_at: inHours(30).toISOString() })).statusCode).toBe(403);
    expect((await setShift(A, appB, { start_at: inHours(-1).toISOString() })).json().error.fields).toHaveProperty('start_at');
    expect((await setShift(A, appB, { start_at: '21 июня' })).statusCode).toBe(400);
    expect((await setShift(A, 999999, { start_at: inHours(30).toISOString() })).statusCode).toBe(404);

    await setShift(A, appB, { start_at: inHours(30).toISOString() });
    const cleared = await setShift(A, appB, { start_at: null });
    expect(cleared.json()).toMatchObject({ startAt: null, attendance: null, notified: false });
  });

  it('кандидат без чата с ботом — назначение сохраняется, notified=false', async () => {
    const D = await createUser('D', { chatId: '', dialogChatId: null });
    const appD = (await app.inject({ method: 'POST', url: '/api/applications', headers: D.auth, payload: { vacancy_id: vacancyId, contact: '+7' } })).json().id;
    await app.inject({ method: 'PATCH', url: `/api/applications/${appD}`, headers: A.auth, payload: { status: 'hired' } });
    const res = await setShift(A, appD, { start_at: inHours(30).toISOString() });
    expect(res.json()).toMatchObject({ attendance: 'pending', notified: false });
  });
});
