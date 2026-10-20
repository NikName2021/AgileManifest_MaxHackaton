import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import QRCode from 'qrcode';
import { app } from '../src/server.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { createUser, resetDb, sendMessageMock, webhookHeaders, type TestUser } from './helpers.js';

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

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  B = await createUser('B');
});

async function published(body: object = {}) {
  const created = await app.inject({
    method: 'POST',
    url: '/api/vacancies',
    headers: A.auth,
    payload: { title: 'Сборщик черешни & клубники <срочно>', region_code: 'Динской район', schedule: 'seasonal', salary_min: 3000, salary_max: 4000, headcount: 12, ...body },
  });
  const id = created.json().id as number;
  await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: A.auth });
  return id;
}

function botStarted(user: TestUser, payload: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: { update_type: 'bot_started', chat_id: `dialog-${user.user.maxUserId}`, user: { user_id: user.user.maxUserId }, payload },
  });
}

function message(user: TestUser, text: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: { update_type: 'message_created', message: { recipient: { chat_id: `dialog-${user.user.maxUserId}` }, sender: { user_id: user.user.maxUserId }, body: { text } } },
  });
}

describe('QR-объявление', () => {
  it('плакат A4: экранированный текст, данные вакансии и QR со ссылкой с меткой qr', async () => {
    const id = await published();
    const res = await app.inject({ method: 'GET', url: `/api/vacancies/${id}/poster.svg`, headers: A.auth });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    const svg = res.body;
    expect(svg).toContain('width="210mm" height="297mm"');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;срочно&gt;');
    expect(svg).not.toContain('<срочно>');
    for (const text of ['3000–4000 ₽', 'сезонная', 'Динской район', 'Нужно человек: 12', `start=apply_${id}_qr`]) expect(svg).toContain(text);

    // В плакате тот же QR, что строит библиотека для этой ссылки.
    const expectedQr = await QRCode.toString(`https://max.ru/season_test_bot?start=apply_${id}_qr`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    const path = /<path[^>]*d="([^"]+)"/g;
    const qrPaths = [...expectedQr.matchAll(path)].map((m) => m[1]);
    for (const d of qrPaths) expect(svg).toContain(d);
  });

  it('отдельный QR и проверки доступа', async () => {
    const id = await published();
    const qr = await app.inject({ method: 'GET', url: `/api/vacancies/${id}/qr.svg`, headers: A.auth });
    expect(qr.statusCode).toBe(200);
    expect(qr.body).toMatch(/^<svg/);

    expect((await app.inject({ method: 'GET', url: `/api/vacancies/${id}/poster.svg`, headers: B.auth })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/vacancies/${id}/poster.svg` })).statusCode).toBe(401);
    const draft = (await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Черновик' } })).json().id;
    const res = await app.inject({ method: 'GET', url: `/api/vacancies/${draft}/poster.svg`, headers: A.auth });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('vacancy_unavailable');
  });

  it('очень длинное название не ломает плакат', async () => {
    const id = await published({ title: 'Сезонный работник на сбор урожая яблок груш слив и абрикосов в фермерском хозяйстве '.repeat(2).trim() });
    const svg = (await app.inject({ method: 'GET', url: `/api/vacancies/${id}/poster.svg`, headers: A.auth })).body;
    expect((svg.match(/font-size="14"/g) ?? []).length).toBeLessThanOrEqual(3);
    expect(svg).toContain('…');
  });
});

describe('источник отклика', () => {
  it('QR, ссылка, карточка, мини-приложение — и статистика по вакансии', async () => {
    const id = await published();
    const C = await createUser('C');
    const D = await createUser('D');

    await botStarted(B, `apply_${id}_qr`);
    await message(B, '+7 900 1');
    await botStarted(C, `apply_${id}`);
    await message(C, '+7 900 2');
    await app.inject({ method: 'POST', url: '/api/applications', headers: D.auth, payload: { vacancy_id: id, contact: '+7 900 3' } });

    const sources = Object.fromEntries((await db.application.findMany({ where: { vacancyId: id }, include: { candidate: true } })).map((a) => [a.candidate.maxUserId, a.source]));
    expect(sources).toEqual({ 'max-B': 'qr', 'max-C': 'link', 'max-D': 'miniapp' });

    const stats = (await app.inject({ method: 'GET', url: `/api/vacancies/${id}/stats`, headers: A.auth })).json();
    expect(stats).toEqual({ total: 3, bySource: { qr: 1, link: 1, miniapp: 1 }, byStatus: { new: 3 } });
    expect((await app.inject({ method: 'GET', url: `/api/vacancies/${id}/stats`, headers: B.auth })).statusCode).toBe(403);
  });

  it('неизвестная метка в ссылке считается обычной ссылкой', async () => {
    const id = await published();
    await botStarted(B, `apply_${id}_zzz`);
    await message(B, '+7 900 1');
    expect((await db.application.findFirstOrThrow()).source).toBe('link');
  });
});
