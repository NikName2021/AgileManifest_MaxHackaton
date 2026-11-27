import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/max/client.js', async () => {
  const helpers = await import('./helpers.js');
  return { maxApi: helpers.maxApiMock };
});

// Образец — по живому ответу opendata.trudvsem.ru от 27.11.2026 (данные обезличены).
const { PORTAL, fetchCompanyVacancies } = vi.hoisted(() => {
const PORTAL = [
  {
    id: '37c64770-e184-11f1-b379-c1bd4d2f8a56',
    'job-name': 'Бариста',
    region: { region_code: '2300000000000', name: 'Краснодарский край' },
    company: { name: 'ООО "КАЛИНА"', inn: '2902063394', ogrn: '1092902002588' },
    salary_min: 50000,
    salary_max: 60000,
    vac_url: 'https://trudvsem.ru/vacancy/card/1092902002588/37c64770-e184-11f1-b379-c1bd4d2f8a56',
    schedule: 'Сменная работа',
    shift: ['Только дневная смена'],
    duty: '<p>Готовить кофе и десерты.</p> Звоните +7(958) 167-12-10 или пишите hr@example.ru, сайт kalina.ru',
    requirements: 'Аккуратность и любовь к кофе.',
    category: { specialisation: 'Туризм, гостиницы, рестораны' },
    typicalPosition: 'Бармен / Официант / Бариста',
    requirement: { experience: 0 },
    contact_list: [
      { contact_type: 'Телефон', contact_value: '+7(958) 167-12-10' },
      { contact_type: 'Эл. почта', contact_value: 'hr@example.ru' },
    ],
    work_places: 3,
  },
  {
    id: '11111111-2222-3333-4444-555555555555',
    'job-name': 'Сборщик урожая (сезонная работа)',
    region: { region_code: '2300000000000', name: 'Краснодарский край' },
    company: { name: 'ООО "КАЛИНА"', inn: '2902063394', ogrn: '1092902002588' },
    salary_min: 0,
    employment: 'Сезонная',
    duty: 'Сбор черешни.',
  },
];
return { PORTAL, fetchCompanyVacancies: vi.fn(async (_company: unknown) => PORTAL) };
});
vi.mock('../src/trudvsem/client.js', () => ({ fetchCompanyVacancies, searchTrudvsemVacancies: vi.fn(async () => []) }));

import { app } from '../src/server.js';
import { settleBroadcasts } from '../src/vacancies/broadcast.js';
import { db } from '../src/db.js';
import { config } from '../src/config.js';
import { parseTrudvsemResponse } from '../src/trudvsem/inboundEmail.js';
import { parseEmail } from '../src/trudvsem/mime.js';
import { createUser, resetDb, sendMessageMock, sentTo, type TestUser } from './helpers.js';

beforeAll(async () => {
  config.inboundEmailDomain = 'in.sezon.test';
  config.inboundEmailSecret = 'inbound-secret';
  await app.ready();
});

afterAll(async () => {
  await settleBroadcasts();
  await app.close();
  await db.$disconnect();
});

let A: TestUser;

beforeEach(async () => {
  await resetDb();
  sendMessageMock.mockClear();
  fetchCompanyVacancies.mockClear();
  A = await createUser('A');
});

const get = (url: string) => app.inject({ method: 'GET', url, headers: A.auth });
const importVacancies = (payload: object) => app.inject({ method: 'POST', url: '/api/vacancies/import/trudvsem', headers: A.auth, payload });

describe('импорт вакансий с «Работы России» по ИНН / ОГРН', () => {
  it('предпросмотр: вакансии компании и что уже импортировано', async () => {
    const res = await get('/api/trudvsem/company-vacancies?company=2902063394');
    expect(res.statusCode, res.body).toBe(200);
    expect(fetchCompanyVacancies).toHaveBeenCalledWith({ inn: '2902063394' });
    expect(res.json()).toMatchObject({
      company: { name: 'ООО "КАЛИНА"', inn: '2902063394', ogrn: '1092902002588' },
      items: [
        { externalId: PORTAL[0].id, title: 'Бариста', salaryMin: 50000, salaryMax: 60000, region: 'Краснодарский край', category: 'Общепит', importedVacancyId: null },
        { externalId: PORTAL[1].id, category: 'Сельское хозяйство', salaryMin: null },
      ],
    });
    await get('/api/trudvsem/company-vacancies?company=1092902002588');
    expect(fetchCompanyVacancies).toHaveBeenLastCalledWith({ ogrn: '1092902002588' });
    expect((await get('/api/trudvsem/company-vacancies?company=123')).statusCode).toBe(400);
    // Без параметра и без сохранённого ИНН — 400.
    expect((await get('/api/trudvsem/company-vacancies')).statusCode).toBe(400);
  });

  it('импорт: черновики по нашим правилам, без дублей, ИНН запоминается', async () => {
    const res = await importVacancies({ company: '2902063394', ids: [PORTAL[0].id] });
    expect(res.statusCode, res.body).toBe(201);
    const [draft] = res.json().created;
    expect(draft).toMatchObject({
      status: 'draft',
      title: 'Бариста',
      regionCode: 'Краснодарский край',
      regionSubject: '23',
      category: 'Общепит',
      schedule: 'permanent',
      salaryMin: 50000,
      salaryMax: 60000,
      headcount: 3,
      contactInfo: '+7 958 167-12-10, hr@example.ru',
      externalSource: 'trudvsem',
      externalId: PORTAL[0].id,
      externalUrl: PORTAL[0].vac_url,
    });
    expect(draft.badges).toEqual(expect.arrayContaining(['shifts', 'day_shifts', 'no_experience']));
    // Контакты из текста вырезаны: у нас они только в поле контакта.
    expect(draft.description).toContain('Готовить кофе и десерты.');
    expect(draft.description).toContain('Требования: Аккуратность');
    expect(draft.description).not.toMatch(/958|hr@|kalina\.ru|<p>/);

    // Повтор и остальные: импортированная пропускается, сезонная создаётся; ИНН уже сохранён.
    const again = (await importVacancies({})).json();
    expect(again.skipped).toEqual([{ externalId: PORTAL[0].id, reason: 'already_imported' }]);
    expect(again.created).toMatchObject([{ title: 'Сборщик урожая (сезонная работа)', schedule: 'seasonal', salaryMin: null }]);
    expect(fetchCompanyVacancies).toHaveBeenLastCalledWith({ inn: '2902063394' });
    expect(await db.vacancy.count()).toBe(2);

    const preview = (await get('/api/trudvsem/company-vacancies')).json();
    expect(preview.items.every((i: { importedVacancyId: number | null }) => i.importedVacancyId !== null)).toBe(true);
    // Черновик публикуется обычным путём.
    const published = await app.inject({ method: 'POST', url: `/api/vacancies/${draft.id}/publish`, headers: A.auth });
    expect(published.statusCode, published.body).toBe(200);
  });

  it('портал недоступен — 502, а не падение', async () => {
    fetchCompanyVacancies.mockRejectedValueOnce(new Error('trudvsem API -> 503'));
    expect((await importVacancies({ company: '2902063394' })).statusCode).toBe(502);
  });
});

const rfc822 = (to: string, subject: string, body: string) =>
  [
    'From: "Работа России" <noreply@trudvsem.ru>',
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `Message-ID: <${Math.random().toString(36).slice(2)}@trudvsem.ru>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ].join('\r\n');

describe('письма об откликах с «Работы России» → воронка', () => {
  async function address() {
    const res = (await get('/api/me/inbound-email')).json();
    expect(res).toMatchObject({ enabled: true, address: expect.stringMatching(/^[0-9a-f]{16}@in\.sezon\.test$/) });
    return res.address as string;
  }
  const send = (raw: string, secret = 'inbound-secret') =>
    app.inject({ method: 'POST', url: '/webhook/inbound-email', headers: { 'content-type': 'message/rfc822', 'x-inbound-secret': secret }, payload: raw });

  it('отклик на импортированную вакансию попадает в воронку с источником trudvsem', async () => {
    const draft = (await importVacancies({ company: '2902063394', ids: [PORTAL[0].id] })).json().created[0];
    const to = await address();
    const body = `Здравствуйте!\nНа вашу вакансию «Бариста» поступил отклик.\nСоискатель: Иванова Мария Петровна\nТелефон: 8 (918) 555-44-33\nПосмотреть отклик: ${PORTAL[0].vac_url}`;
    const raw = rfc822(to, 'Новый отклик на вакансию «Бариста»', body);

    const res = await send(raw);
    expect(res.json()).toMatchObject({ status: 'created', vacancyId: draft.id });
    const application = await db.application.findFirstOrThrow({ include: { candidate: true } });
    expect(application).toMatchObject({ status: 'new', source: 'trudvsem', contact: '+7 918 555-44-33', candidateChatId: null });
    expect(application.candidate).toMatchObject({ displayName: 'Иванова Мария Петровна', dialogChatId: null });
    expect(application.candidate.maxUserId).toMatch(/^external:trudvsem:/);
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('Новый отклик с «Работы России»');

    // Тот же Message-ID — повтор не обрабатывается.
    expect((await send(raw)).json()).toEqual({ status: 'duplicate' });
    expect(await db.application.count()).toBe(1);

    // В списке откликов работодателя — как обычный отклик.
    const list = (await get('/api/applications')).json();
    expect(list.items[0]).toMatchObject({ source: 'trudvsem', candidate: { displayName: 'Иванова Мария Петровна' } });
  });

  it('чужой адрес, не письмо портала, неизвестная вакансия, неверный секрет', async () => {
    const to = await address();
    expect((await send(rfc822('nobody@in.sezon.test', 'Отклик', 'trudvsem.ru'))).json()).toMatchObject({ status: 'rejected', reason: 'unknown_recipient' });
    const spam = rfc822(to, 'Скидки', 'Купите слона').replace('noreply@trudvsem.ru', 'spam@example.com');
    expect((await send(spam)).json()).toMatchObject({ status: 'rejected', reason: 'not_trudvsem' });
    expect((await send(rfc822(to, 'Новый отклик на вакансию «Повар»', 'Соискатель: Пётр\nhttps://trudvsem.ru/x'))).json()).toMatchObject({ status: 'unmatched' });
    expect(sentTo('chat-A').at(-1)?.[1]).toContain('такой вакансии нет');
    expect((await send(rfc822(to, 'x', 'y'), 'wrong')).statusCode).toBe(401);
    expect(await db.application.count()).toBe(0);
  });

  it('разбор MIME: multipart, quoted-printable, HTML, windows-1251', () => {
    const html = '<p>Отклик на вакансию <b>«Повар»</b></p><p>Кандидат: Сидоров Иван</p><a href="https://trudvsem.ru/r/1">Открыть</a>';
    const raw = [
      'From: noreply@trudvsem.ru',
      'Subject: =?windows-1251?B?' + Buffer.from([0xce, 0xf2, 0xea, 0xeb, 0xe8, 0xea]).toString('base64') + '?=',
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      Buffer.from(html).toString('hex').replace(/(..)/g, '=$1'),
      '--b1--',
    ].join('\r\n');
    const email = parseEmail(raw);
    expect(email.subject).toBe('Отклик');
    expect(email.text).toContain('Отклик на вакансию «Повар»');
    expect(parseTrudvsemResponse(email.subject, email.text)).toMatchObject({ vacancyTitle: 'Повар', candidateName: 'Сидоров Иван', responseUrl: 'https://trudvsem.ru/r/1' });
  });

  it('без настроенного домена адрес не выдаётся', async () => {
    config.inboundEmailDomain = null;
    expect((await get('/api/me/inbound-email')).json()).toEqual({ address: null, enabled: false });
    config.inboundEmailDomain = 'in.sezon.test';
  });
});
