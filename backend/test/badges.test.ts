import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { BADGE_GROUPS, BADGE_KEYS, MAX_BADGES_PER_VACANCY } from '../src/vacancies/badges.js';
import { createUser, resetDb, sendMessageMock, type TestUser } from './helpers.js';

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

async function publish(payload: object) {
  const created = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Сборщик урожая', ...payload } });
  expect(created.statusCode, created.body).toBe(201);
  const id = created.json().id as number;
  await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: A.auth });
  return { id, created: created.json() };
}

describe('справочник бейджей', () => {
  it('GET /api/badges — группы с эмодзи, ключи уникальны', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/badges' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.maxPerVacancy).toBe(MAX_BADGES_PER_VACANCY);
    expect(body.groups.map((g: { key: string }) => g.key)).toEqual(['housing', 'food', 'travel', 'pay', 'terms', 'audience', 'schedule', 'place']);
    expect(body.groups[0].items[0]).toEqual({ key: 'housing_free', emoji: '🏠', label: 'Жильё бесплатно' });
    expect(new Set(BADGE_KEYS).size).toBe(BADGE_KEYS.length);
    expect(BADGE_KEYS.length).toBeGreaterThanOrEqual(45);
    for (const g of BADGE_GROUPS) for (const b of g.items) expect(b.emoji.length).toBeGreaterThan(0);
  });
});

describe('бейджи вакансии', () => {
  it('сохраняются ключами, отдаются объектами в порядке справочника, без повторов', async () => {
    const { created } = await publish({ badges: ['tickets_paid', 'housing_free', 'meals_3', 'housing_free'] });
    expect(created.badges).toEqual([
      { key: 'housing_free', emoji: '🏠', label: 'Жильё бесплатно' },
      { key: 'meals_3', emoji: '🍲', label: '3-разовое питание' },
      { key: 'tickets_paid', emoji: '🎫', label: 'Билеты оплатят' },
    ]);
    expect((await db.vacancy.findFirstOrThrow()).badges).toEqual(['tickets_paid', 'housing_free', 'meals_3']);
  });

  it('видны в каталоге, карточке вакансии и истории откликов; отметка «для студентов» — тоже бейдж', async () => {
    const { id } = await publish({ badges: ['housing_free'], student_friendly: true });
    const job = (await app.inject({ method: 'GET', url: `/api/jobs/${id}`, headers: B.auth })).json();
    expect(job.badges.map((b: { key: string }) => b.key)).toEqual(['housing_free', 'students_ok']);
    expect((await app.inject({ method: 'GET', url: '/api/jobs', headers: B.auth })).json().items[0].badges).toHaveLength(2);

    await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: id, contact: '+7' } });
    const history = (await app.inject({ method: 'GET', url: '/api/me/applications', headers: B.auth })).json();
    expect(history.items[0].vacancy.badges.map((b: { key: string }) => b.key)).toEqual(['housing_free', 'students_ok']);
  });

  it('строка бейджей в карточке MAX и на плакате', async () => {
    const { id } = await publish({ badges: ['housing_free', 'meals_3'] });
    const card = sendMessageMock.mock.calls.find((c) => String(c[1]).includes('Сборщик урожая'));
    expect(card?.[1]).toContain('🏠 Жильё бесплатно · 🍲 3\\-разовое питание');
    const poster = (await app.inject({ method: 'GET', url: `/api/vacancies/${id}/poster.svg`, headers: A.auth })).body;
    expect(poster).toContain('🏠 Жильё бесплатно');
  });

  it('фильтр каталога: вакансия должна иметь все перечисленные бейджи', async () => {
    const both = await publish({ title: 'С жильём и едой', badges: ['housing_free', 'meals_3'] });
    await publish({ title: 'Только жильё', badges: ['housing_free'] });
    await publish({ title: 'Без бейджей' });
    const titles = async (q: string) => (await app.inject({ method: 'GET', url: `/api/jobs?${q}`, headers: B.auth })).json().items.map((j: { id: number }) => j.id);
    expect((await titles('badges=housing_free')).length).toBe(2);
    expect(await titles('badges=housing_free,meals_3')).toEqual([both.id]);
    expect((await app.inject({ method: 'GET', url: '/api/jobs?badges=unicorn', headers: B.auth })).statusCode).toBe(400);
  });

  it('валидация: неизвестный ключ, больше 12, правка черновика', async () => {
    const unknown = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'x', badges: ['unicorn'] } });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.fields).toHaveProperty('badges');
    const many = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'x', badges: BADGE_KEYS.slice(0, 13) } });
    expect(many.statusCode).toBe(400);

    const draft = (await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Черновик', badges: ['bar'] } })).json();
    const patched = (await app.inject({ method: 'PATCH', url: `/api/vacancies/${draft.id}`, headers: A.auth, payload: { badges: ['kitchen', 'tips'] } })).json();
    expect(patched.badges.map((b: { key: string }) => b.key)).toEqual(['tips', 'kitchen']);
    const untouched = (await app.inject({ method: 'PATCH', url: `/api/vacancies/${draft.id}`, headers: A.auth, payload: { title: 'Повар' } })).json();
    expect(untouched.badges.map((b: { key: string }) => b.key)).toEqual(['tips', 'kitchen']);
  });

  it('12 бейджей с самым длинным текстом укладываются в лимит карточки вместе с описанием', async () => {
    const longest = [...BADGE_KEYS]
      .map((key) => BADGE_GROUPS.flatMap((g) => g.items).find((b) => b.key === key)!)
      .sort((a, b) => b.label.length - a.label.length)
      .slice(0, 12)
      .map((b) => b.key);
    // Бейджи учитываются в проверке длины: слишком длинное описание вместе с ними — 400.
    const tooLong = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'x', badges: longest, description: 'a'.repeat(3700) } });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().error.fields).toHaveProperty('description');
    const res = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'x', badges: longest, description: 'a'.repeat(3000) } });
    expect(res.statusCode).toBe(201);
    await app.inject({ method: 'POST', url: `/api/vacancies/${res.json().id}/publish`, headers: A.auth });
    const card = sendMessageMock.mock.calls.find((c) => String(c[1]).startsWith('**x**'));
    expect(String(card?.[1]).length).toBeLessThanOrEqual(4000);
  });
});
