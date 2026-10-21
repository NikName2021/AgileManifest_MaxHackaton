import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});
vi.mock('../src/trudvsem/client.js', () => ({ searchTrudvsemVacancies: vi.fn(async () => []) }));

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { normalizeMultiLine, normalizeSingleLine } from '../src/text.js';
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

function createVacancy(payload: object) {
  return app.inject({ method: 'POST', url: '/api/vacancies', headers: A.auth, payload });
}

function expectFieldError(res: { statusCode: number; json(): any }, field: string) {
  expect(res.statusCode).toBe(400);
  expect(res.json().error.code).toBe('validation_error');
  expect(res.json().error.fields, JSON.stringify(res.json())).toHaveProperty(field);
}

describe('нормализация текста', () => {
  it('однострочные поля схлопывают пробелы и переносы', () => {
    expect(normalizeSingleLine('  Сборщик \n\t урожая  ')).toBe('Сборщик урожая');
  });
  it('многострочные — не больше одной пустой строки подряд', () => {
    expect(normalizeMultiLine('строка 1   \r\n\r\n\r\n\r\nстрока 2  ')).toBe('строка 1\n\nстрока 2');
  });
});

describe('вакансия', () => {
  it('нормализует пробелы и переносы в однострочных полях', async () => {
    const res = await createVacancy({ title: '  Сборщик\n\nурожая  ', region_code: ' Краснодарский   край ', contact_info: '' , description: '' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ title: 'Сборщик урожая', regionCode: 'Краснодарский край', contactInfo: null, description: null });
  });

  it('отклоняет неизвестные поля и называет их', async () => {
    const res = await createVacancy({ title: 'Повар', salary: 50000, employer_user_id: 7 });
    expectFieldError(res, 'salary');
    expect(res.json().error.fields).toMatchObject({ salary: ['unknown field'], employer_user_id: ['unknown field'] });
  });

  it('отклоняет текст без букв и цифр, управляющие и невидимые символы', async () => {
    expectFieldError(await createVacancy({ title: '!!!' }), 'title');
    expectFieldError(await createVacancy({ title: '   ' }), 'title');
    expectFieldError(await createVacancy({ title: 'По\u0007вар' }), 'title');
    expectFieldError(await createVacancy({ title: 'По​вар' }), 'title');
    expectFieldError(await createVacancy({ title: 'Повар', contact_info: '---' }), 'contact_info');
    expectFieldError(await createVacancy({ title: 'Повар', region_code: '...' }), 'region_code');
  });

  it('зарплата: целое число до 10 млн ₽', async () => {
    expectFieldError(await createVacancy({ title: 'Повар', salary_min: 10_000_001 }), 'salary_min');
    expectFieldError(await createVacancy({ title: 'Повар', salary_min: 1.5 }), 'salary_min');
    expect((await createVacancy({ title: 'Повар', salary_min: 10_000_000 })).statusCode).toBe(201);
  });

  it('PATCH тоже строгий', async () => {
    const id = (await createVacancy({ title: 'Повар' })).json().id;
    const res = await app.inject({ method: 'PATCH', url: `/api/vacancies/${id}`, headers: A.auth, payload: { titel: 'Шеф' } });
    expectFieldError(res, 'titel');
  });

  it('пустой регион не печатается в карточке', async () => {
    const id = (await createVacancy({ title: 'Повар' })).json().id;
    await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: A.auth });
    const card = sendMessageMock.mock.calls.find((c) => String(c[1]).includes('Повар'));
    expect(card?.[1]).not.toContain('Регион:');
  });
});

describe('отклик и профиль', () => {
  async function published() {
    const id = (await createVacancy({ title: 'Повар', region_code: 'Сочи' })).json().id;
    await app.inject({ method: 'POST', url: `/api/vacancies/${id}/publish`, headers: A.auth });
    return id as number;
  }

  it('vacancy_id — только целое число или строка из цифр', async () => {
    const id = await published();
    for (const vacancy_id of [true, '1e1', `${id}abc`, -1, 1.5, null]) {
      const res = await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id, contact: '+7 900 111-22-33' } });
      expectFieldError(res, 'vacancy_id');
    }
    const ok = await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: String(id), contact: '+7 900 111-22-33' } });
    expect(ok.statusCode).toBe(201);
  });

  it('контакт без букв и цифр отклоняется, пробелы нормализуются; лишние поля — 400', async () => {
    const id = await published();
    expectFieldError(await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: id, contact: '+++' } }), 'contact');
    expectFieldError(
      await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: id, contact: '+7 900 111-22-33', status: 'hired' } }),
      'status'
    );
    const ok = await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: id, contact: '  8 (900)\n111-22-33  ' } });
    expect(ok.json().contact).toBe('+7 900 111-22-33');
    expectFieldError(await app.inject({ method: 'PATCH', url: '/api/me', headers: B.auth, payload: { application_contact: '???' } }), 'application_contact');
  });

  it('смена статуса — строгое тело', async () => {
    const id = await published();
    const appId = (await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: id, contact: '+7 900 111-22-33' } })).json().id;
    expectFieldError(
      await app.inject({ method: 'PATCH', url: `/api/applications/${appId}`, headers: A.auth, payload: { status: 'hired', notify: false } }),
      'notify'
    );
  });

  it('смена не дальше чем через год', async () => {
    const id = await published();
    const appId = (await app.inject({ method: 'POST', url: '/api/applications', headers: B.auth, payload: { vacancy_id: id, contact: '+7 900 111-22-33' } })).json().id;
    await app.inject({ method: 'PATCH', url: `/api/applications/${appId}`, headers: A.auth, payload: { status: 'invited' } });
    const far = new Date(Date.now() + 400 * 864e5).toISOString();
    expectFieldError(await app.inject({ method: 'PATCH', url: `/api/applications/${appId}/shift`, headers: A.auth, payload: { start_at: far } }), 'start_at');
  });
});

describe('query и вход', () => {
  it('целые в query — только цифры', async () => {
    for (const q of ['limit=1e1', 'limit=+5', 'offset=-0', 'salary_from=10000001', 'salary_from=1.0']) {
      expect((await app.inject({ method: 'GET', url: `/api/jobs?${q}`, headers: B.auth })).statusCode, q).toBe(400);
    }
    expect((await app.inject({ method: 'GET', url: '/api/applications?limit=abc', headers: A.auth })).statusCode).toBe(400);
  });

  it('init_data ограничен по длине, лишние поля — 400', async () => {
    expectFieldError(await app.inject({ method: 'POST', url: '/api/auth/max', payload: { init_data: 'x'.repeat(8193) } }), 'init_data');
    expectFieldError(await app.inject({ method: 'POST', url: '/api/auth/max', payload: { init_data: 'x', user_id: 1 } }), 'user_id');
  });
});

describe('диалог бота', () => {
  function message(text: string) {
    return app.inject({
      method: 'POST',
      url: '/webhook/max',
      headers: webhookHeaders(),
      payload: { update_type: 'message_created', message: { recipient: { chat_id: 'chat-A' }, sender: { user_id: 'max-A' }, body: { text } } },
    });
  }
  const lastReply = () => sentTo('chat-A').at(-1)?.[1];

  it('слишком длинное название и бессмысленный ответ переспрашиваются', async () => {
    await message('/новая_вакансия');
    await message('Повар '.repeat(50));
    expect(lastReply()).toContain('уложитесь в 200');
    await message('!!!');
    expect(lastReply()).toContain('нет ни букв, ни цифр');
    await message('Повар');
    expect(lastReply()).toContain('сфере');
    await message('Общепит');
    expect(lastReply()).toContain('регионе');
  });

  it('огромная зарплата не роняет создание вакансии', async () => {
    await message('/новая_вакансия');
    for (const answer of ['Повар', 'Общепит', 'Сочи', 'seasonal']) await message(answer);
    await message('40000-99999999999');
    expect(lastReply()).toContain('лишние нули');
    await message('40000-60000');
    await message('нет');
    await message('+7 900 111-22-33');
    const vacancy = await db.vacancy.findFirstOrThrow({ where: { employerUserId: A.user.id } });
    expect(vacancy).toMatchObject({ salaryMin: 40000, salaryMax: 60000, status: 'draft' });
  });
});
