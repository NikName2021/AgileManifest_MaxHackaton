import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

import { app } from '../src/server.js';
import { db } from '../src/db.js';
import { setBotUsername } from '../src/max/botInfo.js';
import { buildApplyDeepLink, buildVacancyCardText, MAX_CARD_TEXT_LIMIT } from '../src/vacancies/cardText.js';
import { createUser, resetDb, sendMessageMock, sentTo, webhookHeaders, type TestUser } from './helpers.js';

const BOT = 'season_test_bot';

beforeAll(async () => {
  setBotUsername(BOT);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

let A: TestUser; // работодатель
let B: TestUser; // кандидат
let C: TestUser; // посторонний кандидат

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  A = await createUser('A');
  B = await createUser('B');
  C = await createUser('C');
});

type VacancyBody = Record<string, unknown>;

async function createVacancy(owner: TestUser, body: VacancyBody = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/vacancies',
    headers: owner.auth,
    payload: { title: 'Сборщик урожая', region_code: '23', category: 'agriculture', schedule: 'seasonal', ...body },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: number };
}

async function publishedVacancy(owner: TestUser, body: VacancyBody = {}) {
  const vacancy = await createVacancy(owner, body);
  const res = await app.inject({ method: 'POST', url: `/api/vacancies/${vacancy.id}/publish`, headers: owner.auth });
  expect(res.statusCode).toBe(200);
  return res.json() as { id: number; status: string };
}

function apply(user: TestUser, vacancyId: number, contact: unknown = '+7 900 000-00-00') {
  return app.inject({ method: 'POST', url: '/api/applications', headers: user.auth, payload: { vacancy_id: vacancyId, contact } });
}

function get(user: TestUser | null, url: string) {
  return app.inject({ method: 'GET', url, headers: user ? user.auth : {} });
}

function botStarted(user: TestUser, payload: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: {
      update_type: 'bot_started',
      chat_id: `dialog-${user.user.maxUserId}`,
      user: { user_id: user.user.maxUserId, name: user.user.displayName },
      payload,
    },
  });
}

function botMessage(user: TestUser, text: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/max',
    headers: webhookHeaders(),
    payload: {
      update_type: 'message_created',
      message: {
        recipient: { chat_id: `dialog-${user.user.maxUserId}` },
        sender: { user_id: user.user.maxUserId, name: user.user.displayName },
        body: { text },
      },
    },
  });
}

function lastBotReply(user: TestUser): string | undefined {
  const calls = sentTo(`dialog-${user.user.maxUserId}`);
  return calls.at(-1)?.[1];
}

describe('1. каталог: видимость опубликованных чужих вакансий', () => {
  it('B видит вакансию A, A не видит свою в каталоге работника', async () => {
    const v = await publishedVacancy(A);

    const forB = await get(B, '/api/jobs');
    expect(forB.statusCode).toBe(200);
    const body = forB.json();
    expect(body).toMatchObject({ total: 1, limit: 20, offset: 0 });
    expect(body.items[0]).toEqual({
      id: v.id,
      title: 'Сборщик урожая',
      regionCode: '23',
      category: 'agriculture',
      schedule: 'seasonal',
      salaryMin: null,
      salaryMax: null,
      description: null,
      status: 'published',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      employer: { displayName: 'A' },
      myApplication: null,
      canApply: true,
      applyUnavailableReason: null,
    });

    const forA = await get(A, '/api/jobs');
    expect(forA.json()).toMatchObject({ items: [], total: 0 });
  });

  it('не раскрывает служебные поля и контакт работодателя', async () => {
    const v = await publishedVacancy(A, { contact_info: '+7 999 111-22-33' });
    const raw = JSON.stringify([(await get(B, '/api/jobs')).json(), (await get(B, `/api/jobs/${v.id}`)).json()]);
    for (const leaked of ['chatId', 'maxUserId', 'employerChatId', 'cardMessageId', 'contactInfo', '+7 999 111-22-33', 'chat-A', 'max-A']) {
      expect(raw).not.toContain(leaked);
    }
  });

  it('видимость не зависит от cardMessageId', async () => {
    const v = await publishedVacancy(A);
    await db.vacancy.update({ where: { id: v.id }, data: { cardMessageId: null } });
    expect((await get(B, '/api/jobs')).json().total).toBe(1);
  });
});

describe('2. черновики и закрытые вакансии', () => {
  it('не попадают в каталог и недоступны по ID', async () => {
    const draft = await createVacancy(A);
    const closed = await publishedVacancy(A);
    await app.inject({ method: 'POST', url: `/api/vacancies/${closed.id}/close`, headers: A.auth });

    expect((await get(B, '/api/jobs')).json()).toMatchObject({ items: [], total: 0 });
    for (const id of [draft.id, closed.id, 999999]) {
      const res = await get(B, `/api/jobs/${id}`);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    }
    expect((await get(B, '/api/jobs/abc')).statusCode).toBe(400);
    expect((await get(B, '/api/jobs/filters')).json()).toEqual({ regions: [], categories: [] });
  });

  it('своя опубликованная вакансия открывается с canApply=false/own_vacancy', async () => {
    const v = await publishedVacancy(A);
    const res = await get(A, `/api/jobs/${v.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ canApply: false, applyUnavailableReason: 'own_vacancy', myApplication: null });
  });
});

describe('3. фильтры, пагинация, сортировка', () => {
  async function seed() {
    // Разные createdAt, чтобы порядок newest был детерминирован; id растут в том же порядке.
    const specs: [string, VacancyBody][] = [
      ['v_none', { region_code: '23', category: 'agriculture', schedule: 'seasonal' }],
      ['v_zero', { salary_min: 0, salary_max: 0, region_code: '23', category: 'cafe', schedule: 'temporary' }],
      ['v_min_only', { salary_min: 50000, region_code: '16', category: 'cafe', schedule: 'seasonal' }],
      ['v_max_only', { salary_max: 40000, region_code: '16', category: 'agriculture', schedule: 'permanent' }],
      ['v_range', { salary_min: 30000, salary_max: 70000, region_code: '23', category: 'agriculture', schedule: 'seasonal', description: 'Сбор ЯБЛОК в саду' }],
    ];
    const ids: Record<string, number> = {};
    let t = Date.parse('2026-10-01T00:00:00Z');
    for (const [name, body] of specs) {
      const v = await publishedVacancy(A, { title: name, ...body });
      await db.vacancy.update({ where: { id: v.id }, data: { createdAt: new Date((t += 60_000)) } });
      ids[name] = v.id;
    }
    return ids;
  }

  const titles = async (query: string) => (await get(B, `/api/jobs${query}`)).json().items.map((i: { title: string }) => i.title);

  it('newest по умолчанию, total до пагинации, limit/offset', async () => {
    await seed();
    expect(await titles('')).toEqual(['v_range', 'v_max_only', 'v_min_only', 'v_zero', 'v_none']);
    const page = (await get(B, '/api/jobs?limit=2&offset=2')).json();
    expect(page).toMatchObject({ total: 5, limit: 2, offset: 2 });
    expect(page.items.map((i: { title: string }) => i.title)).toEqual(['v_min_only', 'v_zero']);
    expect((await get(B, '/api/jobs?offset=10')).json()).toMatchObject({ items: [], total: 5 });
  });

  it('стабильный порядок при одинаковом createdAt (id DESC)', async () => {
    const ids = await seed();
    await db.vacancy.updateMany({ data: { createdAt: new Date('2026-10-01T00:00:00Z') } });
    const items = (await get(B, '/api/jobs')).json().items.map((i: { id: number }) => i.id);
    expect(items).toEqual(Object.values(ids).sort((a, b) => b - a));
  });

  it('salary_desc: COALESCE(max, min), null в конце, 0 — реальная сумма', async () => {
    await seed();
    expect(await titles('?sort=salary_desc')).toEqual(['v_range', 'v_min_only', 'v_max_only', 'v_zero', 'v_none']);
  });

  it('зарплатный фильтр — пересечение диапазонов, односторонние границы, null исключаются', async () => {
    await seed();
    expect(await titles('?salary_from=45000')).toEqual(['v_range', 'v_min_only']);
    expect(await titles('?salary_to=35000')).toEqual(['v_range', 'v_zero']);
    expect(await titles('?salary_from=35000&salary_to=45000')).toEqual(['v_range', 'v_max_only']);
    expect(await titles('?salary_from=0&salary_to=0')).toEqual(['v_zero']);
    expect(await titles('?salary_from=0')).toEqual(['v_range', 'v_max_only', 'v_min_only', 'v_zero']);
    // Пустое значение параметра — не фильтр (а не 0).
    expect((await get(B, '/api/jobs?salary_from=')).json().total).toBe(5);
  });

  it('q (без учёта регистра, title/description), region_code, category, schedule', async () => {
    await seed();
    expect(await titles('?q=яблок')).toEqual(['v_range']);
    expect(await titles('?q=V_ZERO')).toEqual(['v_zero']);
    expect(await titles('?q=%25')).toEqual([]); // % экранируется, а не работает как wildcard
    expect((await get(B, '/api/jobs?q=%20%20')).json().total).toBe(5);
    expect(await titles('?region_code=16')).toEqual(['v_max_only', 'v_min_only']);
    expect(await titles('?category=cafe&schedule=seasonal')).toEqual(['v_min_only']);
  });

  it('GET /api/jobs/filters — значения реально доступных чужих вакансий', async () => {
    await seed();
    await createVacancy(A, { region_code: '99', category: 'draft-only' }); // черновик не учитывается
    const own = await publishedVacancy(B, { region_code: '77', category: 'own-only' }); // своя не учитывается
    expect(own.id).toBeGreaterThan(0);
    expect((await get(B, '/api/jobs/filters')).json()).toEqual({
      regions: [{ value: '16', label: '16' }, { value: '23', label: '23' }],
      categories: [{ value: 'agriculture', label: 'agriculture' }, { value: 'cafe', label: 'cafe' }],
    });
  });

  it('некорректные параметры -> 400 validation_error с полем', async () => {
    const cases: [string, string][] = [
      ['?limit=0', 'limit'],
      ['?limit=101', 'limit'],
      ['?offset=-1', 'offset'],
      ['?salary_from=-5', 'salary_from'],
      ['?salary_from=10&salary_to=5', 'salary_from'],
      ['?salary_to=2147483648', 'salary_to'],
      ['?sort=oldest', 'sort'],
      ['?schedule=night', 'schedule'],
      [`?q=${'x'.repeat(201)}`, 'q'],
      ['?limit=1.5', 'limit'],
    ];
    for (const [query, field] of cases) {
      const res = await get(B, `/api/jobs${query}`);
      expect(res.statusCode, query).toBe(400);
      expect(res.json().error.code).toBe('validation_error');
      expect(res.json().error.fields, query).toHaveProperty(field);
    }
  });
});

describe('4. отклик кандидата', () => {
  it('одна запись, попытка уведомить работодателя, 201 с безопасным DTO', async () => {
    const v = await publishedVacancy(A);
    sendMessageMock.mockClear();

    const res = await apply(B, v.id, '  @b_in_max  ');
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toEqual({
      id: expect.any(Number),
      vacancyId: v.id,
      candidateUserId: B.user.id,
      status: 'new',
      contact: '@b_in_max',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      notified: true,
    });
    expect(await db.application.count()).toBe(1);

    const toEmployer = sentTo('chat-A');
    expect(toEmployer).toHaveLength(1);
    expect(toEmployer[0][1]).toContain('Контакт: @b\\_in\\_max');

    const job = (await get(B, `/api/jobs/${v.id}`)).json();
    expect(job).toMatchObject({ canApply: false, applyUnavailableReason: 'already_applied', myApplication: { id: body.id, status: 'new' } });
    // Вакансия с откликом не исключается из каталога.
    expect((await get(B, '/api/jobs')).json().items[0].applyUnavailableReason).toBe('already_applied');
  });

  it('contact обязателен: пустой/null/отсутствует/слишком длинный -> 400 с полем contact', async () => {
    const v = await publishedVacancy(A);
    for (const payload of [{ vacancy_id: v.id }, { vacancy_id: v.id, contact: null }, { vacancy_id: v.id, contact: '   ' }, { vacancy_id: v.id, contact: 'x'.repeat(201) }, { vacancy_id: v.id, contact: 42 }]) {
      const res = await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'validation_error', fields: { contact: expect.any(Array) } });
    }
    expect((await apply(B, v.id, 'x'.repeat(200))).statusCode).toBe(201);
  });

  it('draft/closed -> 409 vacancy_unavailable, нет вакансии -> 404 not_found', async () => {
    const draft = await createVacancy(A);
    const closed = await publishedVacancy(A);
    await app.inject({ method: 'POST', url: `/api/vacancies/${closed.id}/close`, headers: A.auth });

    for (const id of [draft.id, closed.id]) {
      const res = await apply(B, id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('vacancy_unavailable');
    }
    const missing = await apply(B, 999999);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    expect(await db.application.count()).toBe(0);
  });
});

describe('5. повторные и параллельные отклики, REST + бот', () => {
  it('повтор через REST -> 409 already_applied без повторного уведомления', async () => {
    const v = await publishedVacancy(A);
    expect((await apply(B, v.id)).statusCode).toBe(201);
    sendMessageMock.mockClear();
    const again = await apply(B, v.id, 'другой контакт');
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('already_applied');
    expect(sentTo('chat-A')).toHaveLength(0);
  });

  it('параллельные запросы: ровно один 201, одна запись, одно уведомление', async () => {
    const v = await publishedVacancy(A);
    sendMessageMock.mockClear();
    const results = await Promise.all(Array.from({ length: 8 }, () => apply(B, v.id)));
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(7);
    for (const r of results.filter((r) => r.statusCode === 409)) expect(r.json().error.code).toBe('already_applied');
    expect(await db.application.count()).toBe(1);
    expect(sentTo('chat-A')).toHaveLength(1);
  });

  it('сначала бот, потом REST -> already_applied', async () => {
    const v = await publishedVacancy(A);
    await botStarted(B, `apply_${v.id}`);
    await botMessage(B, '+7 900 111-11-11');
    expect(lastBotReply(B)).toContain('Отклик отправлен');
    sendMessageMock.mockClear();

    const res = await apply(B, v.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('already_applied');
    expect(await db.application.count()).toBe(1);
    expect(sentTo('chat-A')).toHaveLength(0);
  });

  it('бот начал отклик, REST успел раньше контакта -> бот не создаёт дубль и не шлёт уведомление', async () => {
    const v = await publishedVacancy(A);
    await botStarted(B, `apply_${v.id}`); // pending: ждём контакт
    expect((await apply(B, v.id)).statusCode).toBe(201);
    sendMessageMock.mockClear();

    await botMessage(B, '+7 900 111-11-11');
    expect(lastBotReply(B)).toContain('уже откликались');
    expect(await db.application.count()).toBe(1);
    expect(sentTo('chat-A')).toHaveLength(0);
    expect(await db.pendingApplication.count()).toBe(0);

    // Повторный переход по ссылке — сразу «уже откликались», без запроса контакта.
    await botStarted(B, `apply_${v.id}`);
    expect(lastBotReply(B)).toContain('уже откликались');
  });
});

describe('6. отклик на собственную вакансию', () => {
  it('REST -> 403 self_application_forbidden', async () => {
    const v = await publishedVacancy(A);
    const res = await apply(A, v.id);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('self_application_forbidden');
    expect(await db.application.count()).toBe(0);
  });

  it('бот (deep link) -> отказ без запроса контакта', async () => {
    const v = await publishedVacancy(A);
    await botStarted(A, `apply_${v.id}`);
    expect(lastBotReply(A)).toContain('Это ваша вакансия');
    expect(await db.pendingApplication.count()).toBe(0);
    expect(await db.application.count()).toBe(0);
  });
});

describe('7. гонка закрытия вакансии и отклика', () => {
  it('закрытие, зафиксированное раньше, не даёт сохранить отклик, ожидавший блокировку', async () => {
    const v = await publishedVacancy(A);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let updated!: () => void;
    const updatedSignal = new Promise<void>((resolve) => (updated = resolve));

    // Незакоммиченное закрытие держит блокировку строки вакансии.
    const closing = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`UPDATE vacancies SET status = 'closed' WHERE id = ${v.id}`;
        updated();
        await gate;
      },
      { timeout: 15_000 }
    );
    await updatedSignal;

    let settled = false;
    const applying = apply(B, v.id).then((r) => ((settled = true), r));
    await new Promise((r) => setTimeout(r, 300));
    expect(settled).toBe(false); // отклик ждёт закрытия, а не проходит по устаревшему статусу

    release();
    await closing;
    const res = await applying;
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('vacancy_unavailable');
    expect(await db.application.count()).toBe(0);
  });

  it('отклик до закрытия сохраняется; параллельная пара даёт согласованный результат', async () => {
    for (let i = 0; i < 5; i++) {
      const v = await publishedVacancy(A, { title: `race ${i}` });
      const [applied, closed] = await Promise.all([
        apply(B, v.id),
        app.inject({ method: 'POST', url: `/api/vacancies/${v.id}/close`, headers: A.auth }),
      ]);
      expect(closed.statusCode).toBe(200);
      const count = await db.application.count({ where: { vacancyId: v.id } });
      if (applied.statusCode === 201) expect(count).toBe(1);
      else {
        expect(applied.json().error.code).toBe('vacancy_unavailable');
        expect(count).toBe(0);
      }
    }
  });
});

describe('8–9. история откликов кандидата', () => {
  it('B видит свой отклик с контактом работодателя, C — нет; статус от A виден B; закрытие не удаляет историю', async () => {
    const v = await publishedVacancy(A, { contact_info: '+7 999 111-22-33', salary_min: 50000, salary_max: 70000 });
    const created = (await apply(B, v.id, '+7 900 000-00-01')).json();
    await apply(C, v.id, '+7 900 000-00-02');

    const forB = (await get(B, '/api/me/applications')).json();
    expect(forB).toMatchObject({ total: 1, limit: 20, offset: 0 });
    expect(forB.items[0]).toEqual({
      id: created.id,
      status: 'new',
      contact: '+7 900 000-00-01',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      vacancy: {
        id: v.id,
        title: 'Сборщик урожая',
        regionCode: '23',
        category: 'agriculture',
        schedule: 'seasonal',
        salaryMin: 50000,
        salaryMax: 70000,
        description: null,
        contactInfo: '+7 999 111-22-33',
        status: 'published',
        employer: { displayName: 'A' },
      },
    });
    expect(JSON.stringify(forB)).not.toContain('+7 900 000-00-02');

    const forC = (await get(C, '/api/me/applications')).json();
    expect(forC.total).toBe(1);
    expect(forC.items[0].contact).toBe('+7 900 000-00-02');

    // B не меняет этап найма и не читает чужие отклики через API работодателя.
    const patch = await app.inject({ method: 'PATCH', url: `/api/applications/${created.id}`, headers: B.auth, payload: { status: 'hired' } });
    expect(patch.statusCode).toBe(403);
    expect((await get(B, `/api/vacancies/${v.id}/applications`)).statusCode).toBe(403);
    expect((await get(B, '/api/applications')).json()).toMatchObject({ items: [], total: 0 });

    // A приглашает B — B видит invited и получает уведомление в личный чат.
    sendMessageMock.mockClear();
    const invite = await app.inject({ method: 'PATCH', url: `/api/applications/${created.id}`, headers: A.auth, payload: { status: 'invited' } });
    expect(invite.json()).toMatchObject({ status: 'invited', notified: true });
    expect(sentTo('chat-B')).toHaveLength(1);
    expect((await get(B, '/api/me/applications')).json().items[0].status).toBe('invited');

    await app.inject({ method: 'POST', url: `/api/vacancies/${v.id}/close`, headers: A.auth });
    const afterClose = (await get(B, '/api/me/applications?status=invited')).json();
    expect(afterClose.total).toBe(1);
    expect(afterClose.items[0]).toMatchObject({ status: 'invited', vacancy: { status: 'closed' } });
    expect((await get(B, '/api/me/applications?status=new')).json().total).toBe(0);
    expect((await get(B, '/api/me/applications?limit=0')).statusCode).toBe(400);
  });

  it('порядок createdAt DESC, id DESC и пагинация', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const v = await publishedVacancy(A, { title: `v${i}` });
      ids.push((await apply(B, v.id)).json().id);
    }
    await db.application.updateMany({ data: { createdAt: new Date('2026-10-01T00:00:00Z') } });
    const page = (await get(B, '/api/me/applications?limit=2&offset=1')).json();
    expect(page).toMatchObject({ total: 3, limit: 2, offset: 1 });
    expect(page.items.map((i: { id: number }) => i.id)).toEqual([ids[1], ids[0]]);
  });
});

describe('10. сбои доставки MAX', () => {
  it('ошибка MAX не теряет отклик: 201, notified=false', async () => {
    const v = await publishedVacancy(A);
    sendMessageMock.mockRejectedValueOnce(new Error('MAX API POST /messages -> 500'));
    const res = await apply(B, v.id);
    expect(res.statusCode).toBe(201);
    expect(res.json().notified).toBe(false);
    expect(await db.application.count()).toBe(1);
  });

  it('кандидат без личного чата с ботом: отклик сохраняется, hasBotChat=false, статус без уведомления', async () => {
    const D = await createUser('D', { chatId: '', dialogChatId: null });
    const v = await publishedVacancy(A);
    const res = await apply(D, v.id);
    expect(res.statusCode).toBe(201);
    expect((await get(D, '/api/me')).json()).toMatchObject({ hasBotChat: false });

    const app_ = await db.application.findUniqueOrThrow({ where: { id: res.json().id } });
    expect(app_.candidateChatId).toBeNull();
    const invite = await app.inject({ method: 'PATCH', url: `/api/applications/${app_.id}`, headers: A.auth, payload: { status: 'invited' } });
    expect(invite.json()).toMatchObject({ status: 'invited', notified: false });
  });

  it('групповой "последний чат" не используется для уведомлений кандидату', async () => {
    const G = await createUser('G', { chatId: 'group-chat', dialogChatId: null });
    const v = await publishedVacancy(A);
    const created = (await apply(G, v.id)).json();
    sendMessageMock.mockClear();
    await app.inject({ method: 'PATCH', url: `/api/applications/${created.id}`, headers: A.auth, payload: { status: 'rejected' } });
    expect(sentTo('group-chat')).toHaveLength(0);
  });

  it('bot_started фиксирует личный чат -> hasBotChat=true', async () => {
    const D = await createUser('D', { chatId: '', dialogChatId: null });
    await botStarted(D, '');
    expect((await get(D, '/api/me')).json()).toMatchObject({ hasBotChat: true });
  });
});

describe('11. старые API работодателя', () => {
  it('прежние проверки владения работают', async () => {
    const v = await publishedVacancy(A);
    await apply(B, v.id);

    const listA = (await get(A, '/api/vacancies')).json();
    expect(listA).toHaveLength(1);
    expect(listA[0].applyUrl).toBe(`https://max.ru/${BOT}?start=apply_${v.id}`);
    expect((await get(B, '/api/vacancies')).json()).toEqual([]);
    expect((await get(B, `/api/vacancies/${v.id}`)).statusCode).toBe(403);
    expect((await get(A, `/api/vacancies/${v.id}`)).json()).toMatchObject({ id: v.id, applyUrl: expect.any(String) });
    expect((await app.inject({ method: 'POST', url: `/api/vacancies/${v.id}/close`, headers: B.auth })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: `/api/vacancies/${v.id}`, headers: B.auth, payload: { title: 'x' } })).statusCode).toBe(403);

    const incoming = (await get(A, '/api/applications')).json();
    expect(incoming.total).toBe(1);
    expect(incoming.items[0].candidate.id).toBe(B.user.id);
    expect((await get(A, `/api/vacancies/${v.id}/applications`)).json()).toHaveLength(1);

    const draft = await createVacancy(A);
    expect((await get(A, `/api/vacancies/${draft.id}`)).json().applyUrl).toBeNull();
  });
});

describe('12. авторизация', () => {
  it('без токена или с поддельным токеном -> 401', async () => {
    const urls: [string, string][] = [
      ['GET', '/api/jobs'],
      ['GET', '/api/jobs/filters'],
      ['GET', '/api/jobs/1'],
      ['GET', '/api/me'],
      ['PATCH', '/api/me'],
      ['GET', '/api/me/applications'],
      ['POST', '/api/applications'],
    ];
    for (const [method, url] of urls) {
      for (const headers of [{}, { authorization: 'Bearer forged.token' }, { authorization: `Bearer ${Buffer.from(`${B.user.id}.9999999999.bad`).toString('base64url')}` }]) {
        const res = await app.inject({ method: method as 'GET', url, headers, payload: method === 'GET' ? undefined : {} });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
        expect(res.json().error.code).toBe('unauthorized');
      }
    }
  });

  it('присланные клиентом candidate_user_id/role/status игнорируются', async () => {
    const v = await publishedVacancy(A);
    const res = await app.inject({
      method: 'POST',
      url: '/api/applications',
      headers: B.auth,
      payload: { vacancy_id: v.id, contact: '@b', candidate_user_id: C.user.id, candidate_id: C.user.id, role: 'employer', status: 'hired' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ candidateUserId: B.user.id, status: 'new' });
    expect((await get(C, '/api/me/applications')).json().total).toBe(0);
    expect((await get(B, '/api/me/applications?candidate_id=' + C.user.id)).json().total).toBe(1);
  });
});

describe('13. профиль', () => {
  it('GET/PATCH /api/me: только свой профиль, контакт не переписывает старые отклики', async () => {
    const v = await publishedVacancy(A);
    await apply(B, v.id, 'старый контакт');

    expect((await get(B, '/api/me')).json()).toEqual({ id: B.user.id, displayName: 'B', applicationContact: null, hasBotChat: true });

    const patched = await app.inject({ method: 'PATCH', url: '/api/me', headers: B.auth, payload: { application_contact: '  @new_contact  ' } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toEqual({ id: B.user.id, displayName: 'B', applicationContact: '@new_contact', hasBotChat: true });
    expect((await get(B, '/api/me/applications')).json().items[0].contact).toBe('старый контакт');
    expect((await get(C, '/api/me')).json()).toMatchObject({ id: C.user.id, applicationContact: null });
    // Номер из MAX (phone) не трогается.
    expect((await db.user.findUniqueOrThrow({ where: { id: B.user.id } })).phone).toBeNull();

    const cleared = await app.inject({ method: 'PATCH', url: '/api/me', headers: B.auth, payload: { application_contact: null } });
    expect(cleared.json().applicationContact).toBeNull();
  });

  it('PATCH /api/me отклоняет лишние поля и некорректный контакт', async () => {
    for (const payload of [{}, { application_contact: '' }, { application_contact: 'x'.repeat(201) }, { application_contact: '@b', id: 99 }, { application_contact: '@b', maxUserId: 'x' }, { application_contact: '@b', chatId: 'x' }]) {
      const res = await app.inject({ method: 'PATCH', url: '/api/me', headers: B.auth, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe('validation_error');
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: B.user.id } });
    expect(user).toMatchObject({ maxUserId: 'max-B', chatId: 'chat-B', applicationContact: null });
  });
});

describe('14. текстовая ссылка в карточке', () => {
  it('карточка содержит корректную ссылку с реальным ID и username', async () => {
    const v = await createVacancy(A);
    sendMessageMock.mockClear();
    await app.inject({ method: 'POST', url: `/api/vacancies/${v.id}/publish`, headers: A.auth });

    const [chatId, text, buttons] = sendMessageMock.mock.calls[0];
    const url = `https://max.ru/${BOT}?start=apply_${v.id}`;
    expect(chatId).toBe('chat-A');
    expect(text).toContain(`Откликнуться:\n[https://max\\.ru/season\\_test\\_bot?start\\=apply\\_${v.id}](${url})`);
    expect(text).not.toMatch(/<botUsername>|<vacancyId>/);
    expect(text.length).toBeLessThanOrEqual(MAX_CARD_TEXT_LIMIT);
    // Кнопки исходного сообщения сохраняются.
    expect(buttons).toEqual([
      [{ type: 'callback', text: 'Откликнуться', payload: `apply:${v.id}` }],
      [{ type: 'link', text: 'Откликнуться из другого чата', url }],
    ]);
  });

  it('предварительная проверка длины учитывает ссылку: прошедшая валидацию карточка влезает в лимит', async () => {
    const base = { title: 'T', regionCode: '23', schedule: 'seasonal', salaryMin: null, salaryMax: null, contactInfo: null };
    // Подбираем максимальное description, которое ещё принимает POST /api/vacancies.
    let lo = 0;
    let hi = 4000;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const res = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'T', region_code: '23', schedule: 'seasonal', description: 'a'.repeat(mid) } });
      if (res.statusCode === 201) lo = mid;
      else hi = mid - 1;
    }
    const withoutLink = buildVacancyCardText({ ...base, description: 'a'.repeat(lo) });
    expect(withoutLink.length).toBeLessThan(MAX_CARD_TEXT_LIMIT - 40); // место под ссылку зарезервировано

    const v = await createVacancy(A, { title: 'T', description: 'a'.repeat(lo) });
    sendMessageMock.mockClear();
    const pub = await app.inject({ method: 'POST', url: `/api/vacancies/${v.id}/publish`, headers: A.auth });
    expect(pub.statusCode).toBe(200);
    expect(sendMessageMock.mock.calls[0][1].length).toBeLessThanOrEqual(MAX_CARD_TEXT_LIMIT);

    const tooLong = await app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload: { title: 'T', region_code: '23', schedule: 'seasonal', description: 'a'.repeat(lo + 1) } });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().error.fields).toHaveProperty('description');
  });

  it('некорректный или пустой username — ссылка не строится', () => {
    expect(buildApplyDeepLink(5, 'bad name')).toBeNull();
    expect(buildApplyDeepLink(5, '')).toBeNull();
    expect(buildApplyDeepLink(5, 'ok_bot')).toBe('https://max.ru/ok_bot?start=apply_5');
    expect(buildVacancyCardText({ title: 'T', regionCode: '', schedule: 'seasonal', salaryMin: null, salaryMax: null, description: null, contactInfo: null })).not.toContain('Откликнуться');
  });

  it('deep link из текста ведёт в действующий обработчик bot_started', async () => {
    const v = await publishedVacancy(A);
    await botStarted(B, `apply_${v.id}`);
    expect(lastBotReply(B)).toContain('поделитесь контактом');
    await botMessage(B, '@b_contact');
    expect(lastBotReply(B)).toContain('Отклик отправлен');
    expect((await get(B, '/api/me/applications')).json().items[0]).toMatchObject({ contact: '@b_contact', vacancy: { id: v.id } });

    await app.inject({ method: 'POST', url: `/api/vacancies/${v.id}/close`, headers: A.auth });
    await botStarted(C, `apply_${v.id}`);
    expect(lastBotReply(C)).toContain('недоступна');
  });
});
