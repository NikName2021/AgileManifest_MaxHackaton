import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
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

let A: TestUser; // работодатель
let B: TestUser; // нанят прошлым летом
let C: TestUser; // нанят прошлым летом, без личного чата с ботом
let D: TestUser; // получил отказ
let lastSeason: number;

async function publish(owner: TestUser, title: string) {
  const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: owner.auth, payload: { title, region_code: 'Краснодар', schedule: 'seasonal', salary_min: 3000 } });
  const id = created.json().id as number;
  expect((await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: owner.auth })).statusCode).toBe(200);
  return id;
}

async function applyAndSet(user: TestUser, vacancyId: number, status: string, contact: string) {
  const res = await app.inject({ method: 'POST', url: '/api/applications', headers: user.auth, payload: { vacancy_id: vacancyId, contact } });
  const id = res.json().id as number;
  await app.inject({ method: 'PATCH', url: `/api/applications/${id}`, headers: A.auth, payload: { status } });
  return id;
}

function press(user: TestUser, chatId: string, payload: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: {
      update_type: 'message_callback',
      message: { recipient: { chat_id: chatId } },
      callback: { callback_id: 'cb', payload, user: { user_id: user.user.maxUserId, name: user.user.displayName } },
    },
  });
}

function invite(owner: TestUser, vacancyId: number, payload?: object) {
  return app.inject({ method: 'POST', url: `/api/vacancies/${vacancyId}/team-invites`, headers: owner.auth, payload });
}

function lastButtonsTo(chatId: string) {
  const calls = sentTo(chatId);
  return calls.at(-1)?.[2] as { payload: string }[][] | undefined;
}

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  B = await createUser('B');
  C = await createUser('C', { chatId: '', dialogChatId: null });
  D = await createUser('D');
  lastSeason = await publish(A, 'Сборщик черешни 2025');
  await applyAndSet(B, lastSeason, 'hired', '+7 900 111-11-11');
  await applyAndSet(C, lastSeason, 'hired', '@c_in_max');
  await applyAndSet(D, lastSeason, 'rejected', '+7 900 444-44-44');
  sendMessageMock.mockClear();
});

describe('GET /api/team', () => {
  it('только нанятые на вакансиях работодателя, с контактом и признаком доставки', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/team', headers: A.auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    const byId = Object.fromEntries(body.items.map((m: { candidate: { id: number } }) => [m.candidate.id, m]));
    expect(byId[B.user.id]).toEqual({
      candidate: { id: B.user.id, displayName: 'B' },
      contact: '+7 900 111-11-11',
      hiredCount: 1,
      lastHiredAt: expect.any(String),
      lastVacancy: { id: lastSeason, title: 'Сборщик черешни 2025' },
      reliable: false,
      hasBotChat: true,
    });
    expect(byId[C.user.id].hasBotChat).toBe(false);
    expect(byId[D.user.id]).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/chatId|maxUserId|chat-B/);

    // Чужая бригада не видна.
    expect((await app.inject({ method: 'GET', url: '/api/team', headers: B.auth })).json()).toEqual({ items: [], total: 0 });
    expect((await app.inject({ method: 'GET', url: '/api/team' })).statusCode).toBe(401);
  });

  it('несколько сезонов складываются, надёжные — наверху', async () => {
    const second = await publish(A, 'Упаковщик 2025');
    await applyAndSet(B, second, 'hired', '+7 900 111-11-11');
    const mark = await app.inject({ method: 'PATCH', url: `/api/team/${C.user.id}`, headers: A.auth, payload: { reliable: true } });
    expect(mark.json()).toEqual({ candidateId: C.user.id, reliable: true });

    const items = (await app.inject({ method: 'GET', url: '/api/team', headers: A.auth })).json().items;
    expect(items.map((m: { candidate: { id: number } }) => m.candidate.id)).toEqual([C.user.id, B.user.id]);
    expect(items[1]).toMatchObject({ hiredCount: 2, lastVacancy: { id: second } });
  });

  it('отметить можно только своего прошлого работника', async () => {
    for (const [user, id] of [[A, D.user.id], [B, C.user.id]] as const) {
      const res = await app.inject({ method: 'PATCH', url: `/api/team/${id}`, headers: user.auth, payload: { reliable: true } });
      expect(res.statusCode).toBe(404);
    }
    const bad = await app.inject({ method: 'PATCH', url: `/api/team/${B.user.id}`, headers: A.auth, payload: { reliable: 'yes' } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('POST /api/vacancies/:id/team-invites', () => {
  it('приглашает всю бригаду, пропускает тех, кому некуда написать, повтор не шлёт второе сообщение', async () => {
    const season = await publish(A, 'Сборщик черешни 2026');
    sendMessageMock.mockClear();

    const res = await invite(A, season);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sent: 1,
      results: expect.arrayContaining([
        { candidateId: B.user.id, outcome: 'sent' },
        { candidateId: C.user.id, outcome: 'no_bot_chat' },
      ]),
    });
    const toB = sentTo('chat-B');
    expect(toB).toHaveLength(1);
    expect(toB[0][1]).toContain('Сборщик черешни 2026');
    expect(toB[0][1]).toContain('График: сезонная');
    expect(lastButtonsTo('chat-B')?.[0].map((b) => b.payload)).toEqual([expect.stringMatching(/^team_invite:\d+:yes$/), expect.stringMatching(/^team_invite:\d+:no$/)]);

    const again = await invite(A, season);
    expect(again.json().results).toContainEqual({ candidateId: B.user.id, outcome: 'already_invited' });
    expect(sentTo('chat-B')).toHaveLength(1);

    const list = (await app.inject({ method: 'GET', url: `/api/vacancies/${season}/team-invites`, headers: A.auth })).json();
    expect(list.items).toEqual([{ id: expect.any(Number), status: 'sent', createdAt: expect.any(String), respondedAt: null, candidate: { id: B.user.id, displayName: 'B' } }]);
  });

  it('выборочно: не из бригады, уже откликнулся', async () => {
    const season = await publish(A, 'Сезон 2026');
    await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: season, contact: '+7' } });
    const res = await invite(A, season, { candidate_ids: [B.user.id, D.user.id, 999999] });
    expect(res.json()).toEqual({
      sent: 0,
      results: [
        { candidateId: B.user.id, outcome: 'already_applied' },
        { candidateId: D.user.id, outcome: 'not_in_team' },
        { candidateId: 999999, outcome: 'not_in_team' },
      ],
    });
  });

  it('сбой доставки — undelivered, повторный вызов отправляет снова', async () => {
    const season = await publish(A, 'Сезон 2026');
    sendMessageMock.mockRejectedValueOnce(new Error('MAX 500'));
    expect((await invite(A, season, { candidate_ids: [B.user.id] })).json().results).toEqual([{ candidateId: B.user.id, outcome: 'delivery_failed' }]);
    expect((await db.teamInvite.findFirstOrThrow()).status).toBe('undelivered');

    expect((await invite(A, season, { candidate_ids: [B.user.id] })).json().results).toEqual([{ candidateId: B.user.id, outcome: 'sent' }]);
    expect((await db.teamInvite.findFirstOrThrow()).status).toBe('sent');
  });

  it('параллельные вызовы не дублируют сообщение', async () => {
    const season = await publish(A, 'Сезон 2026');
    sendMessageMock.mockClear();
    await Promise.all(Array.from({ length: 5 }, () => invite(A, season)));
    expect(sentTo('chat-B')).toHaveLength(1);
    expect(await db.teamInvite.count()).toBe(1);
  });

  it('проверки доступа и состояния вакансии', async () => {
    const draft = (await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Черновик' } })).json().id;
    expect((await invite(A, draft)).json().error.code).toBe('vacancy_unavailable');
    expect((await invite(B, lastSeason)).statusCode).toBe(403);
    expect((await invite(A, 999999)).statusCode).toBe(404);
    expect((await invite(A, lastSeason, { candidate_ids: [] })).statusCode).toBe(400);
    expect((await invite(A, lastSeason, { all: true })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/api/vacancies/${lastSeason}/team-invites`, headers: B.auth })).statusCode).toBe(403);
  });
});

describe('ответ прошлого работника в боте', () => {
  async function invited() {
    const season = await publish(A, 'Сборщик черешни 2026');
    await invite(A, season);
    const yes = lastButtonsTo('chat-B')![0][0].payload;
    const no = lastButtonsTo('chat-B')![0][1].payload;
    sendMessageMock.mockClear();
    return { season, yes, no };
  }

  it('«Приду» — отклик со статусом «Приглашён» и прошлым контактом, работодатель получает уведомление', async () => {
    const { season, yes } = await invited();
    await press(B, 'chat-B', yes);

    const application = await db.application.findUniqueOrThrow({ where: { vacancyId_candidateUserId: { vacancyId: season, candidateUserId: B.user.id } } });
    expect(application).toMatchObject({ status: 'invited', contact: '+7 900 111-11-11', candidateChatId: 'chat-B' });
    expect((await db.teamInvite.findFirstOrThrow()).status).toBe('accepted');
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('Передал работодателю');
    const toEmployer = sentTo('chat-A');
    expect(toEmployer).toHaveLength(1);
    expect(toEmployer[0][1]).toContain('Из вашей бригады: B готов(а) выйти');
    expect(toEmployer[0][2]).toBeDefined(); // кнопки воронки

    // Видно и в истории кандидата.
    const history = (await app.inject({ method: 'GET', url: '/api/me/applications', headers: B.auth })).json();
    expect(history.items[0]).toMatchObject({ status: 'invited', vacancy: { id: season } });

    // Повторное нажатие ничего не дублирует.
    sendMessageMock.mockClear();
    await press(B, 'chat-B', yes);
    expect(await db.application.count({ where: { vacancyId: season } })).toBe(1);
    expect(sentTo('chat-A')).toHaveLength(0);
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('уже ответили');
  });

  it('«Не в этот раз» — declined, работодатель предупреждён, отклика нет', async () => {
    const { season, no } = await invited();
    await press(B, 'chat-B', no);
    expect((await db.teamInvite.findFirstOrThrow()).status).toBe('declined');
    expect(await db.application.count({ where: { vacancyId: season } })).toBe(0);
    expect(sentTo('chat-A')[0][1]).toContain('не сможет выйти');
  });

  it('чужое нажатие игнорируется', async () => {
    const { season, yes } = await invited();
    await press(D, 'chat-B', yes);
    expect((await db.teamInvite.findFirstOrThrow()).status).toBe('sent');
    expect(await db.application.count({ where: { vacancyId: season } })).toBe(0);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('вакансию закрыли до ответа — expired, отклик не создаётся', async () => {
    const { season, yes } = await invited();
    await app.inject({ method: 'POST', url: `/api/vacancies/${season}/close`, headers: A.auth });
    await press(B, 'chat-B', yes);
    expect((await db.teamInvite.findFirstOrThrow()).status).toBe('expired');
    expect(await db.application.count({ where: { vacancyId: season } })).toBe(0);
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('уже закрыта');
  });

  it('нет сохранённого контакта — бот спрашивает его обычным путём отклика', async () => {
    const { season, yes } = await invited();
    await db.application.updateMany({ where: { candidateUserId: B.user.id }, data: { contact: null } });
    await press(B, 'chat-B', yes);
    expect(await db.pendingApplication.findUnique({ where: { chatId: 'chat-B' } })).toMatchObject({ vacancyId: season });
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('поделитесь контактом');
  });
});

describe('hiredAt', () => {
  it('проставляется при найме', async () => {
    const app_ = await db.application.findFirstOrThrow({ where: { candidateUserId: B.user.id } });
    expect(app_.hiredAt).toBeInstanceOf(Date);
    const rejected = await db.application.findFirstOrThrow({ where: { candidateUserId: D.user.id } });
    expect(rejected.hiredAt).toBeNull();
  });
});
