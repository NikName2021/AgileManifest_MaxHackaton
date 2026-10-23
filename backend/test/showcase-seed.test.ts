import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { createUser, resetDb, sendMessageMock, type TestUser } from './helpers.js';

// Сидер — отдельный процесс на собранном dist (как на сервере): npm run build перед тестами.
function runSeeder(...args: string[]) {
  const out = execFileSync('node', ['prisma/seed-showcase.mjs', ...args], {
    env: { ...process.env, ALLOW_SHOWCASE_SEED: 'true', DATABASE_URL: process.env.TEST_DATABASE_URL },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await settleBroadcasts();
  await app.close();
  await db.$disconnect();
});

let owner: TestUser;
let viewer: TestUser;

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  owner = await createUser('Owner');
  viewer = await createUser('Viewer');
});

const get = (user: TestUser, url: string) => app.inject({ method: 'GET', url, headers: user.auth }).then((r) => r.json());

describe('сидер витрины', () => {
  it('наполняет каталог разнообразными вакансиями и оба кабинета владельца', async () => {
    const result = runSeeder(`--owner-max-id=${owner.user.maxUserId}`);
    expect(result.created).toMatchObject({ employers: 10, candidates: 18, vacancies: 27, applications: 33 });
    expect(sendMessageMock).not.toHaveBeenCalled();

    // Каталог работника: опубликованные чужие вакансии, разные регионы, бейджи, «Южный» с галочкой.
    const jobs = await get(viewer, '/api/jobs?limit=100');
    expect(jobs.total).toBeGreaterThanOrEqual(20);
    const regions = new Set(jobs.items.map((j: any) => j.subject?.code));
    expect(regions.size).toBeGreaterThanOrEqual(7);
    expect(jobs.items.every((j: any) => j.badges.length >= 1 && j.badges.length <= 10)).toBe(true);
    const harvest = jobs.items.find((j: any) => j.title === 'Сборщик урожая / Рабочий сада');
    // У владельца не было названия компании — на время демо он «Агрокомплекс «Южный»», а не имя из MAX.
    expect(harvest.employer).toMatchObject({ displayName: 'Агрокомплекс «Южный»', trusted: true, confirmedHires: 6 });
    expect(jobs.items.every((j: any) => j.employer.companyName === j.employer.displayName)).toBe(true);
    expect(harvest.badges.map((b: any) => b.emoji)).toEqual(['🏠', '🍲', '🎫']);
    expect(harvest.studentFriendly).toBe(true);
    expect((await get(viewer, '/api/jobs?student_friendly=true')).total).toBeGreaterThanOrEqual(8);
    expect((await get(viewer, '/api/jobs/filters')).regions.length).toBeGreaterThanOrEqual(7);

    // Кабинет работодателя владельца: вакансии, черновик, входящие отклики, бригада.
    const myVacancies = await get(owner, '/api/vacancies');
    expect(myVacancies.map((v: any) => v.status).sort()).toEqual(['closed', 'draft', 'published', 'published', 'published']);
    const incoming = await get(owner, '/api/applications?limit=100');
    expect(new Set(incoming.items.map((a: any) => a.status))).toEqual(new Set(['hired', 'rejected', 'invited', 'new', 'contacted']));
    const team = await get(owner, '/api/team');
    expect(team.total).toBe(6);
    expect(team.items.slice(0, 2).every((m: any) => m.reliable)).toBe(true);
    const invites = await get(owner, `/api/vacancies/${myVacancies.find((v: any) => v.title.startsWith('Сборщик урожая')).id}/team-invites`);
    expect(invites.items.map((i: any) => i.status).sort()).toEqual(['accepted', 'accepted', 'declined', 'sent']);

    // Кабинет работника владельца: отклики на разных этапах с дорожными картами.
    const mine = await get(owner, '/api/me/applications');
    expect(mine.total).toBe(4);
    const byTitle = Object.fromEntries(mine.items.map((a: any) => [a.vacancy.title, a.timeline]));
    expect(byTitle['Старший бариста курорта'].current).toBe('invited');
    expect(byTitle['Официант'].outcome.key).toBe('rejected');
    expect(byTitle['Вожатый'].current).toBe('applied');
    for (const timeline of Object.values(byTitle) as any[]) {
      const times = timeline.steps.filter((s: any) => s.reachedAt).map((s: any) => Date.parse(s.reachedAt));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(Math.max(...times)).toBeLessThanOrEqual(Date.now());
    }
  });

  it('повторный запуск пересоздаёт без дублей, --remove убирает только демо-данные', async () => {
    const own = (await app.inject({ method: 'POST', url: '/api/vacancies', headers: owner.auth, payload: { title: 'Моя настоящая вакансия' } })).json();

    runSeeder(`--owner-max-id=${owner.user.maxUserId}`);
    const counts = async () => ({ vacancies: await db.vacancy.count(), applications: await db.application.count(), users: await db.user.count(), events: await db.applicationEvent.count() });
    const first = await counts();
    const second = runSeeder(`--owner-max-id=${owner.user.maxUserId}`);
    expect(second.removed.vacancies).toBe(27);
    expect(await counts()).toEqual(first);

    const removed = runSeeder('--remove');
    // 9 демо-работодателей («Южный» — аккаунт владельца) и 18 кандидатов.
    expect(removed.removed).toEqual({ vacancies: 27, users: 27 });
    expect(await db.vacancy.findMany({ select: { id: true } })).toEqual([{ id: own.id }]);
    expect(await db.user.count()).toBe(2);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.user.id } })).companyName).toBeNull();
    expect(await db.application.count()).toBe(0);
  });

  it('владельца можно указать id в «Сезоне»', async () => {
    const result = runSeeder(`--owner-id=${owner.user.id}`);
    expect(result.created.owner).toEqual({ id: owner.user.id, displayName: 'Owner' });
    expect((await get(owner, '/api/team')).total).toBe(6);
  });

  it('своё название компании владельца сидер не меняет и не удаляет', async () => {
    await db.user.update({ where: { id: owner.user.id }, data: { companyName: 'Ферма «Своя»' } });
    runSeeder(`--owner-id=${owner.user.id}`);
    expect((await get(owner, '/api/me')).companyName).toBe('Ферма «Своя»');
    runSeeder('--remove');
    expect((await get(owner, '/api/me')).companyName).toBe('Ферма «Своя»');
  });

  it('без владельца — только витрина, без своих данных', async () => {
    const result = runSeeder();
    expect(result.created).toMatchObject({ vacancies: 26, applications: 29, owner: null });
    expect(await get(owner, '/api/vacancies')).toEqual([]);
  });

  it('неизвестный владелец — понятная ошибка, прежние демо-данные не удалены', async () => {
    runSeeder();
    const before = await db.vacancy.count();
    expect(() => runSeeder('--owner-max-id=nobody')).toThrow(/not found/);
    expect(await db.vacancy.count()).toBe(before);
  });
});
