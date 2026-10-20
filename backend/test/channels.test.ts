import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { notifyPartnerChannels } from '../src/channels/service.js';
import { createUser, maxApiMock, resetDb, sendMessageMock, sentTo, webhookHeaders, type TestUser } from './helpers.js';

beforeAll(async () => {
  setBotUsername('season_test_bot');
  await app.ready();
});

afterAll(async () => {
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
    expect(list.items).toEqual([{ id: channel.id, title: 'Студотряды КубГУ', isChannel: true, active: false, region: null, studentOnly: false, removed: false, createdAt: expect.any(String) }]);
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
    expect(text).toContain(`start=apply_${id}_ch`);
    expect(buttons).toEqual([[{ type: 'link', text: 'Откликнуться', url: `https://max.ru/season_test_bot?start=apply_${id}_ch` }]]);
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
