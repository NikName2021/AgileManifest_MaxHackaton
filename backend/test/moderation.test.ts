import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});
vi.mock('../src/trudvsem/client.js', () => ({ searchTrudvsemVacancies: vi.fn(async () => []) }));

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { findContactLike, normalizeContact, normalizeContactList } from '../src/moderation.js';
import { createUser, resetDb, sendMessageMock, sentTo, webhookHeaders, type TestUser } from './helpers.js';

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
  A = await createUser('A');
  B = await createUser('B');
});

const inject = (user: TestUser, method: 'POST' | 'PATCH', url: string, payload: object) =>
  app.inject({ method, url, headers: user.auth, payload });

function expectFieldError(res: { statusCode: number; json(): any }, field: string) {
  expect(res.statusCode, res.body).toBe(400);
  expect(res.json().error.fields, res.body).toHaveProperty(field);
}

async function published(payload: object = {}) {
  const created = await inject(A, 'POST', '/api/vacancies', { title: 'Бариста', region_code: 'Краснодарский край', ...payload });
  expect(created.statusCode, created.body).toBe(201);
  await inject(A, 'POST', `/api/vacancies/${created.json().id}/publish`, {});
  return created.json();
}

describe('формат контакта', () => {
  it('телефон, @ник, e-mail, ссылка на мессенджер — в едином виде', () => {
    expect(normalizeContact('8 (900) 123-45-67')).toBe('+7 900 123-45-67');
    expect(normalizeContact('+79001234567')).toBe('+7 900 123-45-67');
    expect(normalizeContact('+375 29 123-45-67')).toBe('+375291234567');
    expect(normalizeContact('@ivan_max')).toBe('@ivan_max');
    expect(normalizeContact('Ivan@Mail.ru')).toBe('ivan@mail.ru');
    expect(normalizeContact('t.me/ivan')).toBe('https://t.me/ivan');
    expect(normalizeContact('https://max.ru/u/abc')).toBe('https://max.ru/u/abc');
    expect(normalizeContactList('+7 900 123-45-67; @ivan_max или ivan@mail.ru')).toBe('+7 900 123-45-67, @ivan_max, ivan@mail.ru');
  });

  it('мусор, выдуманные номера и чужие сайты отклоняются', () => {
    for (const bad of ['8787878787878', '+7 000 000-00-00', '+7 999 999-99-99', '+7', '@b', 'привет', 'http://kazino.ru/win', 'kazino.ru', 'max.ru']) {
      expect(normalizeContact(bad), bad).toBeNull();
    }
    expect(normalizeContactList('@a_1, @a_2, @a_3, @a_4')).toBeNull();
  });

  it('в свободном тексте находит ссылки, телефоны, почту и @ники, но не зарплаты и время', () => {
    expect(findContactLike('Пишите на t.me/ivan')).toBe('link');
    expect(findContactLike('подробнее на кафе.рф')).toBe('link');
    expect(findContactLike('звоните 8 (900) 123-45-67')).toBe('phone');
    expect(findContactLike('или +79001234567')).toBe('phone');
    expect(findContactLike('почта ivan@mail.ru')).toBe('email');
    expect(findContactLike('пишите @ivan_max')).toBe('handle');
    for (const ok of ['Смена с 6:00 до 14:00, 70 000–90 000 ₽', 'т.е. работа в г.Москва, ул. Ленина 5', 'Зарплата 80 000 - 120 000 руб., 10-12 часов', 'с 12.06.2026']) {
      expect(findContactLike(ok), ok).toBeNull();
    }
  });
});

describe('модерация в API', () => {
  it('вакансия: ссылки и контакты запрещены везде, кроме contact_info', async () => {
    expectFieldError(await inject(A, 'POST', '/api/vacancies', { title: 'Бариста t.me/coffee' }), 'title');
    expectFieldError(await inject(A, 'POST', '/api/vacancies', { title: 'Бариста', description: 'Звоните 8 900 123 45 67' }), 'description');
    expectFieldError(await inject(A, 'POST', '/api/vacancies', { title: 'Бариста', description: 'Резюме на hr@coffee.ru' }), 'description');
    expectFieldError(await inject(A, 'POST', '/api/vacancies', { title: 'Бариста', category: 'Общепит @coffee_hr' }), 'category');
    expectFieldError(await inject(A, 'POST', '/api/vacancies', { title: 'Бариста', region_code: 'Ялта www.yalta.ru' }), 'region_code');
    expectFieldError(await inject(A, 'POST', '/api/vacancies', { title: 'Бариста', contact_info: '8787878787878' }), 'contact_info');
    expectFieldError(await inject(A, 'POST', '/api/vacancies', { title: 'Бариста', contact_info: 'http://kazino.ru/win' }), 'contact_info');

    const ok = await inject(A, 'POST', '/api/vacancies', { title: 'Бариста', contact_info: '8 (900) 123-45-67, @coffee_hr' });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json().contactInfo).toBe('+7 900 123-45-67, @coffee_hr');
    expectFieldError(await inject(A, 'PATCH', `/api/vacancies/${ok.json().id}`, { description: 'Наш сайт coffee.ru' }), 'description');
  });

  it('отклик, профиль, смена: контакт в своём формате, в остальном тексте контактов нет', async () => {
    const v = await published();
    expectFieldError(await inject(B, 'POST', '/api/applications', { vacancy_id: v.id, contact: '8787878787878' }), 'contact');
    expectFieldError(await inject(B, 'PATCH', '/api/me', { application_contact: 'пишите в личку' }), 'application_contact');
    expectFieldError(await inject(A, 'PATCH', '/api/me', { company_name: 'Кафе coffee.ru' }), 'company_name');
    expectFieldError(await inject(A, 'POST', '/api/me/subscriptions', { region_code: 'Ялта t.me/x' }), 'region_code');

    const app1 = await inject(B, 'POST', '/api/applications', { vacancy_id: v.id, contact: '89001112233' });
    expect(app1.json().contact).toBe('+7 900 111-22-33');
    await inject(A, 'PATCH', `/api/applications/${app1.json().id}`, { status: 'invited' });
    const shift = await inject(A, 'PATCH', `/api/applications/${app1.json().id}/shift`, { start_at: new Date(Date.now() + 86400000).toISOString(), note: 'Звонить 8 900 123 45 67' });
    expectFieldError(shift, 'note');
  });
});

describe('контакт работодателя', () => {
  it('нет в публичной карточке MAX; в «Моих откликах» — только после приглашения', async () => {
    const v = await published({ contact_info: '@coffee_hr' });
    const card = sendMessageMock.mock.calls.find((c) => String(c[1]).includes('Бариста'));
    expect(String(card?.[1])).not.toContain('coffee');

    const application = (await inject(B, 'POST', '/api/applications', { vacancy_id: v.id, contact: '@cand_b' })).json();
    const contactFor = async () => (await app.inject({ method: 'GET', url: '/api/me/applications', headers: B.auth })).json().items[0].vacancy.contactInfo;
    expect(await contactFor()).toBeNull();
    await inject(A, 'PATCH', `/api/applications/${application.id}`, { status: 'contacted' });
    expect(await contactFor()).toBeNull();
    await inject(A, 'PATCH', `/api/applications/${application.id}`, { status: 'rejected' });
    expect(await contactFor()).toBeNull();
    await inject(A, 'PATCH', `/api/applications/${application.id}`, { status: 'hired' });
    expect(await contactFor()).toBe('@coffee_hr');
    expect(sentTo('chat-B').at(-1)?.[1]).toContain('Контакт работодателя: @coffee\\_hr');
  });
});

describe('модерация в боте', () => {
  function message(user: TestUser, text: string) {
    return app.inject({
      method: 'POST',
      url: '/webhook/max',
      headers: webhookHeaders(),
      payload: { update_type: 'message_created', message: { recipient: { chat_id: user.user.chatId }, sender: { user_id: user.user.maxUserId }, body: { text } } },
    });
  }
  const lastReply = (user: TestUser) => sentTo(user.user.chatId).at(-1)?.[1];

  it('диалог вакансии: ссылка в требованиях и мусор вместо контакта переспрашиваются', async () => {
    await message(A, '/новая_вакансия');
    for (const answer of ['Бариста', 'кофейня', 'Сочи', 'seasonal', '40000-60000']) await message(A, answer);
    await message(A, 'Пишите в t.me/coffee');
    expect(lastReply(A)).toContain('Уберите ссылку');
    await message(A, 'Опыт не нужен');
    await message(A, '8787878787878');
    expect(lastReply(A)).toContain('Не похоже на контакт');
    await message(A, '89001234567, @coffee_hr');
    const vacancy = await db.vacancy.findFirstOrThrow({ where: { employerUserId: A.user.id } });
    expect(vacancy).toMatchObject({ category: 'Общепит', description: 'Опыт не нужен', contactInfo: '+7 900 123-45-67, @coffee_hr' });
  });

  it('отклик через бота: мусор вместо контакта переспрашивается', async () => {
    const v = await published();
    await app.inject({
      method: 'POST',
      url: '/webhook/max',
      headers: webhookHeaders(),
      payload: { update_type: 'bot_started', chat_id: B.user.chatId, user: { user_id: B.user.maxUserId }, payload: `apply_${v.id}` },
    });
    await message(B, '8787878787878');
    expect(lastReply(B)).toContain('Не понял контакт');
    expect(await db.application.count()).toBe(0);
    await message(B, '8 900 111 22 33');
    expect((await db.application.findFirstOrThrow()).contact).toBe('+7 900 111-22-33');
  });
});
