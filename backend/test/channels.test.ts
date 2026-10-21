import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { digestMoment, notifyPartnerChannels, sendChannelDigestsOnce } from '../src/channels/service.js';
import { createUser, maxApiMock, resetDb, sendMessageMock, sentTo, webhookHeaders, type TestUser } from './helpers.js';

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
let U: TestUser; // представитель вуза

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  U = await createUser('U');
});

function webhook(payload: object) {
  return app.inject({ method: 'POST', url: '/webhook/max', headers: webhookHeaders(), payload });
}

const addBot = (chatId: string, user: TestUser, isChannel = true) =>
  webhook({ update_type: 'bot_added', chat_id: chatId, user: { user_id: user.user.maxUserId, name: 'U' }, is_channel: isChannel });

async function channelId(chatId: string) {
  return (await db.partnerChannel.findUniqueOrThrow({ where: { chatId } })).id;
}

function patch(user: TestUser, id: number, payload: object) {
  return app.inject({ method: 'PATCH', url: `/api/partner-channels/${id}`, headers: user.auth, payload });
}

async function publish(body: object) {
  const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Вожатый', ...body } });
  const id = created.json().id as number;
  await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: A.auth });
  return id;
}

describe('каналы партнёров', () => {
  it('bot_added регистрирует канал выключенным и пишет владельцу; владелец включает публикацию', async () => {
    await addBot('-100', U);
    const channel = await db.partnerChannel.findUniqueOrThrow({ where: { chatId: '-100' } });
    expect(channel).toMatchObject({ ownerUserId: U.user.id, isChannel: true, active: false, title: 'Студотряды КубГУ' });
    expect(maxApiMock.getChat).toHaveBeenCalledWith('-100');
    expect(sentTo('chat-U').at(-1)?.[1]).toContain('«Студотряды КубГУ»');

    const list = (await app.inject({ method: 'GET', url: '/api/partner-channels', headers: U.auth })).json();
    expect(list.items).toEqual([{
      id: channel.id, title: 'Студотряды КубГУ', isChannel: true, active: false, region: null, studentOnly: false,
      categories: [], schedule: null, salaryFrom: null, trustedOnly: false, badges: [], mode: 'instant', digestHour: 10,
      removed: false, createdAt: expect.any(String),
      stats: { vacanciesPosted: 0, applications: 0, hired: 0, lastPostedAt: null },
    }]);
    expect((await app.inject({ method: 'GET', url: '/api/partner-channels', headers: A.auth })).json().items).toEqual([]);

    const updated = await patch(U, channel.id, { active: true, region_code: 'Краснодар', student_only: true });
    expect(updated.json()).toMatchObject({ active: true, region: { code: '23' }, studentOnly: true });
    expect((await patch(A, channel.id, { active: true })).statusCode).toBe(404);
    expect((await patch(U, channel.id, { region_code: 'Нигде' })).statusCode).toBe(400);
    expect((await patch(U, channel.id, {})).statusCode).toBe(400);
  });

  it('подходящая вакансия публикуется в активный канал со ссылкой, а не callback-кнопкой; один раз', async () => {
    await addBot('-100', U);
    await addBot('-200', U);
    await addBot('-300', U);
    await patch(U, await channelId('-100'), { active: true, region_code: '23', student_only: true });
    await patch(U, await channelId('-200'), { active: true, region_code: '16' }); // другой регион
    // -300 не включён
    sendMessageMock.mockClear();

    const id = await publish({ region_code: 'Сочи', student_friendly: true });
    await vi.waitFor(() => expect(sentTo('-100')).toHaveLength(1));
    const [, text, buttons] = sentTo('-100')[0];
    const channel100 = await channelId('-100');
    expect(text).toContain(`start=apply_${id}_ch${channel100}`);
    expect(buttons).toEqual([[{ type: 'link', text: 'Откликнуться', url: `https://max.ru/season_test_bot?start=apply_${id}_ch${channel100}` }]]);
    expect(sentTo('-200')).toHaveLength(0);
    expect(sentTo('-300')).toHaveLength(0);

    await Promise.all([notifyPartnerChannels(id), notifyPartnerChannels(id)]);
    expect(sentTo('-100')).toHaveLength(1);
  });

  it('студенческий канал не получает обычные вакансии; удалённый бот — публикаций нет', async () => {
    await addBot('-100', U);
    await patch(U, await channelId('-100'), { active: true, student_only: true });
    sendMessageMock.mockClear();
    const regular = await publish({ student_friendly: false });
    await notifyPartnerChannels(regular);
    expect(sentTo('-100')).toHaveLength(0);

    await webhook({ update_type: 'bot_removed', chat_id: '-100', user: { user_id: 'max-U' } });
    const list = (await app.inject({ method: 'GET', url: '/api/partner-channels', headers: U.auth })).json();
    expect(list.items[0]).toMatchObject({ active: false, removed: true });
    const student = await publish({ student_friendly: true, title: 'Студенческая' });
    await notifyPartnerChannels(student);
    expect(sentTo('-100')).toHaveLength(0);
    expect((await patch(U, await channelId('-100'), { active: true })).statusCode).toBe(409);

    // Бота добавили снова — канал восстановлен.
    await addBot('-100', U);
    expect((await patch(U, await channelId('-100'), { active: true })).statusCode).toBe(200);
  });

  it('бот не отвечает на сообщения в чате партнёра и не делает его «текущим» чатом пользователя', async () => {
    await addBot('-100', U, false);
    sendMessageMock.mockClear();
    await webhook({
      update_type: 'message_created',
      message: { recipient: { chat_id: '-100' }, sender: { user_id: 'max-U' }, body: { text: 'Всем привет!' } },
    });
    expect(sentTo('-100')).toHaveLength(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: U.user.id } })).chatId).toBe('chat-U');
  });
});

describe('фильтры, дайджест и статистика канала', () => {
  it('фильтры: сферы, график, зарплата, только надёжные, бейджи', async () => {
    await addBot('-100', U);
    const id100 = await channelId('-100');
    const res = await patch(U, id100, {
      active: true, categories: ['кафе', 'Гостиницы и туризм'], schedule: 'seasonal', salary_from: 50000, badges: ['housing_free'],
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      categories: ['Общепит', 'Гостиницы и туризм'], schedule: 'seasonal', salaryFrom: 50000, trustedOnly: false,
      badges: [{ key: 'housing_free', emoji: '🏠', label: 'Жильё бесплатно' }], mode: 'instant',
    });
    expect((await patch(U, id100, { categories: ['Обшепит'] })).json().error.fields).toHaveProperty('categories');
    expect((await patch(U, id100, { digest_hour: 24 })).statusCode).toBe(400);

    sendMessageMock.mockClear();
    const base = { category: 'Общепит', schedule: 'seasonal', salary_max: 60000, badges: ['housing_free'] };
    const ok = await publish(base);
    const wrongCategory = await publish({ ...base, category: 'Склад и логистика' });
    const wrongSchedule = await publish({ ...base, schedule: 'temporary' });
    const lowSalary = await publish({ ...base, salary_max: 40000 });
    const noBadge = await publish({ ...base, badges: [] });
    await settleBroadcasts();
    for (const id of [ok, wrongCategory, wrongSchedule, lowSalary, noBadge]) await notifyPartnerChannels(id);
    expect(sentTo('-100').map((c) => String(c[1]))).toEqual([expect.stringContaining(`apply_${ok}_ch${id100}`)]);

    // Только надёжные: у A нет подтверждённых выходов — его вакансии не проходят.
    await patch(U, id100, { trusted_only: true, categories: [], schedule: null, salary_from: null, badges: [] });
    sendMessageMock.mockClear();
    await notifyPartnerChannels(await publish({ title: 'Ещё одна' }));
    expect(sentTo('-100')).toHaveLength(0);
  });

  it('дайджест: раз в день одним постом в выбранный час, без повторов', async () => {
    await addBot('-100', U);
    const id100 = await channelId('-100');
    await patch(U, id100, { active: true, mode: 'digest', digest_hour: 9 });
    sendMessageMock.mockClear();
    const first = await publish({ title: 'Бариста', salary_min: 45000, salary_max: 45000, region_code: 'Сочи', schedule: 'seasonal' });
    const second = await publish({ title: 'Официант' });
    await settleBroadcasts();
    // В режиме дайджеста вакансии сразу не публикуются.
    expect(sentTo('-100')).toHaveLength(0);

    const now = new Date();
    const moment = digestMoment(new Date(now.getTime() + 24 * 3600 * 1000), 9);
    expect(await sendChannelDigestsOnce(new Date(moment.getTime() - 60_000))).toBe(0);
    expect(await sendChannelDigestsOnce(new Date(moment.getTime() + 60_000))).toBe(1);
    const [[, text, buttons]] = sentTo('-100');
    expect(buttons).toBeUndefined();
    expect(text).toContain('**Новые вакансии за сутки**');
    expect(text).toContain('**Бариста** — 45 000 ₽');
    expect(text).toContain('Сочи · Сезонная работа');
    expect(text).toContain(`[Откликнуться](https://max.ru/season_test_bot?start=apply_${first}_ch${id100})`);
    expect(text).toContain(`apply_${second}_ch${id100}`);
    // Повторный прогон в тот же день и на следующий — без новых вакансий поста нет.
    expect(await sendChannelDigestsOnce(new Date(moment.getTime() + 120_000))).toBe(0);
    expect(await sendChannelDigestsOnce(new Date(moment.getTime() + 24 * 3600 * 1000 + 60_000))).toBe(0);
    expect(sentTo('-100')).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/api/partner-channels', headers: U.auth })).json().items[0].stats).toMatchObject({ vacanciesPosted: 2 });
  });

  it('статистика: отклики по ссылке из поста засчитываются каналу', async () => {
    await addBot('-100', U);
    const id100 = await channelId('-100');
    await patch(U, id100, { active: true });
    const id = await publish({});
    await settleBroadcasts();
    const B = await createUser('B');
    await webhook({ update_type: 'bot_started', chat_id: 'chat-B', user: { user_id: 'max-B' }, payload: `apply_${id}_ch${id100}` });
    await webhook({ update_type: 'message_created', message: { recipient: { chat_id: 'chat-B' }, sender: { user_id: 'max-B' }, body: { text: '+7 900 111-22-33' } } });
    expect(await db.application.findFirstOrThrow()).toMatchObject({ source: 'channel', partnerChannelId: id100 });
    // Номер несуществующего канала в ссылке не засчитывается.
    const C = await createUser('C');
    await webhook({ update_type: 'bot_started', chat_id: 'chat-C', user: { user_id: 'max-C' }, payload: `apply_${id}_ch999999` });
    await webhook({ update_type: 'message_created', message: { recipient: { chat_id: 'chat-C' }, sender: { user_id: 'max-C' }, body: { text: '+7 900 111-22-44' } } });
    expect((await db.application.findFirstOrThrow({ where: { candidateUserId: C.user.id } })).partnerChannelId).toBeNull();

    const stats = (await app.inject({ method: 'GET', url: '/api/partner-channels', headers: U.auth })).json().items[0].stats;
    expect(stats).toEqual({ vacanciesPosted: 1, applications: 1, hired: 0, lastPostedAt: expect.any(String) });
  });
});
