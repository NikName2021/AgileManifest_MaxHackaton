import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});
vi.mock('../src/trudvsem/client.js', () => ({ searchTrudvsemVacancies: vi.fn(async () => []) }));

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { buildVacancyCardText, formatSalary, peopleCount } from '../src/vacancies/cardText.js';
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

const get = (url: string, user?: TestUser) => app.inject({ method: 'GET', url, headers: user?.auth });

async function createVacancy(payload: object) {
  const res = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Бариста', ...payload } });
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

async function publish(payload: object) {
  const v = await createVacancy(payload);
  await app.inject({ method: 'POST', url: `/api/vacancies/${v.id}/publish`, headers: A.auth });
  return v;
}

describe('карточка вакансии в MAX', () => {
  it('блоки: заголовок, оплата и условия, бейджи, описание, ссылка', () => {
    const text = buildVacancyCardText(
      {
        title: 'Бариста на набережной',
        regionCode: 'Краснодарский край',
        schedule: 'seasonal',
        salaryMin: 111,
        salaryMax: 111111,
        description: 'Научим готовить кофе.',
        headcount: 111,
        badges: ['wifi'],
        trustedEmployer: true,
      },
      'https://max.ru/season_test_bot?start=apply_28_ch3'
    );
    expect(text).toBe(
      [
        '**Бариста на набережной**',
        '✓ Надёжный работодатель',
        '',
        '**111–111 111 ₽**',
        'Краснодарский край · Сезонная работа',
        'Набор: 111 человек',
        '',
        '📶 Wi\\-Fi в жилье',
        '',
        'Научим готовить кофе\\.',
        '',
        '[Ссылка для отклика](https://max.ru/season_test_bot?start=apply_28_ch3)',
      ].join('\n')
    );
  });

  it('пустые блоки не выводятся; зарплата и численность', () => {
    expect(buildVacancyCardText({ title: 'Повар', regionCode: '', schedule: 'temporary', salaryMin: null, salaryMax: null, description: null })).toBe(
      '**Повар**\n\n**По договорённости**\nВременная работа'
    );
    expect(formatSalary(50000, 50000)).toBe('50 000 ₽');
    expect(formatSalary(0, 0)).toBe('0 ₽');
    expect(formatSalary(0, null)).toBe('от 0 ₽');
    expect(formatSalary(null, 70000)).toBe('до 70 000 ₽');
    expect([1, 2, 5, 11, 12, 21, 22, 111].map(peopleCount)).toEqual(['1 человек', '2 человека', '5 человек', '11 человек', '12 человек', '21 человек', '22 человека', '111 человек']);
  });
});

describe('подсказки бейджей', () => {
  it('по началу слова, падежу, опечатке и синониму; уже выбранные исключаются', async () => {
    const keys = async (q: string, extra = '') => (await get(`/api/badges/suggest?q=${encodeURIComponent(q)}${extra}`)).json().items.map((b: { key: string }) => b.key);
    const first = (await get('/api/badges/suggest?q=жил')).json().items[0];
    expect(first).toEqual({ key: 'housing_free', emoji: '🏠', label: 'Жильё бесплатно', group: { key: 'housing', label: 'Жильё и быт' } });
    expect(await keys('жилья')).toContain('housing_free');
    expect(await keys('обшежитие')).toEqual(['hostel']);
    expect((await keys('кормят')).slice(0, 2)).toEqual(['meals_3', 'meals_2']);
    expect(await keys('еда')).not.toContain('accessible');
    expect(await keys('жил', '&exclude=housing_free,hostel')).not.toContain('housing_free');
    expect(await keys('жил', '&limit=2')).toHaveLength(2);
    expect((await get('/api/badges/suggest')).statusCode).toBe(400);
    expect((await get('/api/badges/suggest?q=жил&limit=50')).statusCode).toBe(400);
  });
});

describe('сферы деятельности', () => {
  it('синоним заменяется на название сферы, новая сфера сохраняется и предлагается другим', async () => {
    expect((await createVacancy({ category: 'кафе' })).category).toBe('Общепит');
    expect((await createVacancy({ category: 'общепит' })).category).toBe('Общепит');
    const own = await publish({ category: 'Пчеловодство' });
    expect(own.category).toBe('Пчеловодство');
    expect((await createVacancy({ category: 'пчеловодство' })).category).toBe('Пчеловодство');
    expect(await db.category.count()).toBe(1);

    const suggest = async (q: string) => (await get(`/api/categories/suggest?q=${encodeURIComponent(q)}`)).json().items;
    expect((await suggest('пчел'))[0]).toEqual({ name: 'Пчеловодство', emoji: null, builtIn: false, vacancies: 1, match: 'similar' });
    expect((await suggest('Обшепит'))[0]).toMatchObject({ name: 'Общепит', match: 'similar' });
    expect((await suggest('кафе'))[0]).toMatchObject({ name: 'Общепит', emoji: '🍽️', builtIn: true, match: 'synonym' });
    expect((await suggest('Общепит'))[0]).toMatchObject({ name: 'Общепит', match: 'exact' });

    const list = (await get('/api/categories')).json().items;
    expect(list[0]).toEqual({ name: 'Пчеловодство', emoji: null, builtIn: false, vacancies: 1 });
    expect(list.filter((c: { builtIn: boolean }) => c.builtIn).length).toBeGreaterThanOrEqual(15);
  });

  it('фильтр каталога и подписка понимают синонимы; неизвестная сфера в подписке — 400', async () => {
    const v = await publish({ category: 'Общепит' });
    expect((await get('/api/jobs?category=кафе', B)).json().items.map((j: { id: number }) => j.id)).toEqual([v.id]);

    const subscribe = (category: string) => app.inject({ method: 'POST', url: '/api/me/subscriptions', headers: B.auth, payload: { category } });
    const created = await subscribe('ресторан');
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().category).toBe('Общепит');
    const typo = await subscribe('Обшепит');
    expect(typo.statusCode).toBe(400);
    expect(typo.json().error.fields).toHaveProperty('category');
  });

  it('бот спрашивает сферу и исправляет явную опечатку', async () => {
    const message = (text: string) =>
      app.inject({
        method: 'POST',
        url: '/webhook/max',
        headers: webhookHeaders(),
        payload: { update_type: 'message_created', message: { recipient: { chat_id: 'chat-A' }, sender: { user_id: 'max-A' }, body: { text } } },
      });
    await message('/новая_вакансия');
    await message('Повар');
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('В какой сфере');
    for (const answer of ['Обшепит', 'Сочи', 'seasonal', '40000-60000', 'нет', '@chef_hr']) await message(answer);
    expect(await db.vacancy.findFirstOrThrow()).toMatchObject({ title: 'Повар', category: 'Общепит' });
  });
});
