import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

const trudvsem = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../src/trudvsem/client.js', () => ({ searchTrudvsemVacancies: trudvsem.search }));

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { getBenchmark, formatBenchmarkText } from '../src/trudvsem/benchmarkService.js';
import { backfillRegionSubjects } from '../src/regions/service.js';
import { createUser, resetDb, type TestUser } from './helpers.js';

const salaries = (n: number, min: number, max: number) => Array.from({ length: n }, () => ({ salary_min: min, salary_max: max }));

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
  trudvsem.search.mockReset();
  A = await createUser('A');
  B = await createUser('B');
});

describe('бенчмарк по региону', () => {
  it('регион распознан и данных достаточно — ориентир по региону', async () => {
    trudvsem.search.mockResolvedValueOnce([...salaries(6, 40000, 60000), { salary_min: 0, salary_max: 0 }]);
    const b = await getBenchmark('под Краснодаром', 'сборщик');
    expect(trudvsem.search).toHaveBeenCalledWith('сборщик', '2300000000000');
    expect(b).toMatchObject({ scope: 'region', regionName: 'Краснодарский край', vacancyCount: 6, avgSalaryMin: 40000, avgSalaryMax: 60000 });
    expect(formatBenchmarkText(b)).toContain('в регионе «Краснодарский край»');
  });

  it('в регионе мало данных — ориентир по России', async () => {
    trudvsem.search.mockResolvedValueOnce(salaries(2, 30000, 50000)).mockResolvedValueOnce(salaries(10, 45000, 65000));
    const b = await getBenchmark('Калмыкия', 'сборщик');
    expect(trudvsem.search).toHaveBeenNthCalledWith(1, 'сборщик', '0800000000000');
    expect(trudvsem.search).toHaveBeenNthCalledWith(2, 'сборщик', undefined);
    expect(b).toMatchObject({ scope: 'country', regionName: null, vacancyCount: 10 });
    expect(formatBenchmarkText(b)).toContain('по России');
  });

  it('регион не распознан — сразу по России; повтор берётся из кэша', async () => {
    trudvsem.search.mockResolvedValue(salaries(3, 1000, 2000));
    await getBenchmark('деревня Простоквашино', 'пастух');
    await getBenchmark('посёлок Нигде', 'пастух');
    expect(trudvsem.search).toHaveBeenCalledTimes(1);
    expect(trudvsem.search).toHaveBeenCalledWith('пастух', undefined);
  });

  it('trudvsem недоступен и кэша нет — null', async () => {
    trudvsem.search.mockRejectedValue(new Error('down'));
    expect(await getBenchmark('Краснодар', 'повар')).toBeNull();
  });
});

describe('регион в API', () => {
  it('вакансия получает код субъекта, каталог фильтрует по нему', async () => {
    const created = (await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Повар', region_code: 'Сочи, Адлер' } })).json();
    expect(created).toMatchObject({ regionCode: 'Сочи, Адлер', regionSubject: '23', subject: { code: '23', name: 'Краснодарский край' } });
    await app.inject({ method: 'POST', url: `/api/vacancies/${created.id}/publish`, headers: A.auth });

    const filters = (await app.inject({ method: 'GET', url: '/api/jobs/filters', headers: B.auth })).json();
    expect(filters.regions).toEqual([{ value: '23', label: 'Краснодарский край' }]);
    expect((await app.inject({ method: 'GET', url: '/api/jobs?region_code=23', headers: B.auth })).json().total).toBe(1);
    // Старое поведение — точное совпадение с исходным текстом — сохранено.
    expect((await app.inject({ method: 'GET', url: `/api/jobs?region_code=${encodeURIComponent('Сочи, Адлер')}`, headers: B.auth })).json().total).toBe(1);

    const patched = (await app.inject({ method: 'PATCH', url: `/api/vacancies/${created.id}`, headers: A.auth, payload: { title: 'x' } }));
    expect(patched.statusCode).toBe(409); // опубликованную не правим — проверим правку на черновике
    const draft = (await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'Черновик', region_code: 'Краснодар' } })).json();
    const moved = (await app.inject({ method: 'PATCH', url: `/api/vacancies/${draft.id}`, headers: A.auth, payload: { region_code: 'Казань' } })).json();
    expect(moved).toMatchObject({ regionSubject: '16', subject: { name: 'Республика Татарстан' } });
  });

  it('GET /api/regions — 85 субъектов без авторизации', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/regions' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(85);
    expect(res.json().items).toContainEqual({ code: '23', name: 'Краснодарский край' });
  });

  it('backfill заполняет старые записи и не трогает нераспознанные', async () => {
    const old = await db.vacancy.create({ data: { employerUserId: A.user.id, title: 'Старая', regionCode: 'Ростов-на-Дону', category: 'general', schedule: 'seasonal' } });
    const unknown = await db.vacancy.create({ data: { employerUserId: A.user.id, title: 'Где-то', regionCode: 'Простоквашино', category: 'general', schedule: 'seasonal' } });
    expect(await backfillRegionSubjects()).toBe(1);
    expect((await db.vacancy.findUniqueOrThrow({ where: { id: old.id } })).regionSubject).toBe('61');
    expect((await db.vacancy.findUniqueOrThrow({ where: { id: unknown.id } })).regionSubject).toBeNull();
    expect(await backfillRegionSubjects()).toBe(0);
  });
});
