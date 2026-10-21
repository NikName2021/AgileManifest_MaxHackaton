import { Prisma } from '@prisma/client';
import { db } from '../db.js';
import { regionDto, type RegionDto } from '../regions/service.js';
import { config } from '../config.js';
import { employerTrustMap, type EmployerTrust } from '../employers/trust.js';
import { loadTimelines } from '../application/timeline.js';
import { resolveBadges, type BadgeDef } from '../vacancies/badges.js';

// Кабинет работника. Только явные DTO: chatId, maxUserId и служебные поля доставки наружу не уходят.
// Доступ — по userId из сессии; режим «работник/работодатель» выбирает интерфейс, а не права.

export type ApplyUnavailableReason = 'already_applied' | 'own_vacancy';

export interface MyApplicationRef {
  id: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobDto {
  id: number;
  title: string;
  regionCode: string;
  subject: RegionDto | null;
  category: string;
  schedule: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  headcount: number | null;
  // null — headcount не указан.
  spotsLeft: number | null;
  studentFriendly: boolean;
  badges: BadgeDef[];
  status: string;
  createdAt: Date;
  // displayName — название компании, а если оно не задано — имя в MAX; companyName — само название или null.
  // trusted — «Надёжный работодатель», confirmedHires — сколько людей подтвердили выход к нему.
  employer: { displayName: string | null; companyName: string | null } & EmployerTrust;
  myApplication: MyApplicationRef | null;
  canApply: boolean;
  applyUnavailableReason: ApplyUnavailableReason | null;
}

interface JobRow {
  id: number;
  title: string;
  regionCode: string;
  regionSubject: string | null;
  category: string;
  schedule: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  headcount: number | null;
  hiredCount: number;
  studentFriendly: boolean;
  badges: string[];
  status: string;
  createdAt: Date;
  employerUserId: number;
  employerDisplayName: string | null;
  employerCompanyName: string | null;
}

function toJobDto(row: JobRow, viewerUserId: number, myApplication: MyApplicationRef | null, trust: EmployerTrust): JobDto {
  const reason: ApplyUnavailableReason | null =
    row.employerUserId === viewerUserId ? 'own_vacancy' : myApplication ? 'already_applied' : null;
  return {
    id: row.id,
    title: row.title,
    regionCode: row.regionCode,
    subject: regionDto(row.regionSubject),
    category: row.category,
    schedule: row.schedule,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    description: row.description,
    headcount: row.headcount,
    spotsLeft: row.headcount === null ? null : Math.max(0, row.headcount - row.hiredCount),
    studentFriendly: row.studentFriendly,
    badges: resolveBadges(row.badges, row.studentFriendly),
    status: row.status,
    createdAt: row.createdAt,
    employer: { displayName: row.employerDisplayName, companyName: row.employerCompanyName, ...trust },
    myApplication,
    canApply: reason === null,
    applyUnavailableReason: reason,
  };
}

// Один запрос на всю страницу, без N+1.
async function findMyApplications(viewerUserId: number, vacancyIds: number[]): Promise<Map<number, MyApplicationRef>> {
  if (vacancyIds.length === 0) return new Map();
  const rows = await db.application.findMany({
    where: { candidateUserId: viewerUserId, vacancyId: { in: vacancyIds } },
    select: { id: true, vacancyId: true, status: true, createdAt: true, updatedAt: true },
  });
  return new Map(rows.map((r) => [r.vacancyId, { id: r.id, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt }]));
}

const JOB_COLUMNS = Prisma.sql`
  v.id, v.title, v.region_code AS "regionCode", v.region_subject AS "regionSubject", v.category, v.schedule,
  v.salary_min AS "salaryMin", v.salary_max AS "salaryMax", v.description, v.headcount, v.student_friendly AS "studentFriendly", v.badges, v.status,
  (SELECT COUNT(*)::int FROM applications a WHERE a.vacancy_id = v.id AND a.status = 'hired') AS "hiredCount",
  v.created_at AS "createdAt", v.employer_user_id AS "employerUserId",
  COALESCE(u.company_name, u.display_name) AS "employerDisplayName", u.company_name AS "employerCompanyName"`;

export interface ListJobsParams {
  q?: string;
  region_code?: string;
  category?: string;
  schedule?: string;
  student_friendly?: boolean;
  badges?: string[];
  salary_from?: number;
  salary_to?: number;
  sort: 'newest' | 'salary_desc';
  limit: number;
  offset: number;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

function nonEmpty(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

export async function listJobs(viewerUserId: number, params: ListJobsParams) {
  // cardMessageId не участвует: это признак доставки карточки, а не доступности вакансии.
  const conditions: Prisma.Sql[] = [
    Prisma.sql`v.status = 'published'`,
    Prisma.sql`v.employer_user_id <> ${viewerUserId}`,
  ];

  const q = nonEmpty(params.q);
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(Prisma.sql`(v.title ILIKE ${pattern} ESCAPE '\\' OR v.description ILIKE ${pattern} ESCAPE '\\')`);
  }
  const regionCode = nonEmpty(params.region_code);
  // Значение из /api/jobs/filters: код субъекта или исходный текст нераспознанного региона.
  if (regionCode) conditions.push(Prisma.sql`(v.region_subject = ${regionCode} OR v.region_code = ${regionCode})`);
  const category = nonEmpty(params.category);
  if (category) conditions.push(Prisma.sql`v.category = ${category}`);
  if (params.schedule) conditions.push(Prisma.sql`v.schedule = ${params.schedule}`);
  if (params.student_friendly !== undefined) conditions.push(Prisma.sql`v.student_friendly = ${params.student_friendly}`);
  if (params.badges?.length) conditions.push(Prisma.sql`v.badges @> ${params.badges}::text[]`);

  // Пересечение диапазонов; единственная граница вакансии служит обеими. Вакансия без зарплаты
  // при активном фильтре отсекается (сравнение с NULL ложно).
  if (params.salary_from !== undefined) {
    conditions.push(Prisma.sql`COALESCE(v.salary_max, v.salary_min) >= ${params.salary_from}`);
  }
  if (params.salary_to !== undefined) {
    conditions.push(Prisma.sql`COALESCE(v.salary_min, v.salary_max) <= ${params.salary_to}`);
  }

  const where = Prisma.join(conditions, ' AND ');
  const orderBy =
    params.sort === 'salary_desc'
      ? Prisma.sql`COALESCE(v.salary_max, v.salary_min) DESC NULLS LAST, v.created_at DESC, v.id DESC`
      : Prisma.sql`v.created_at DESC, v.id DESC`;

  const [rows, countRows] = await Promise.all([
    db.$queryRaw<JobRow[]>`
      SELECT ${JOB_COLUMNS}
      FROM vacancies v JOIN users u ON u.id = v.employer_user_id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${params.limit} OFFSET ${params.offset}`,
    db.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM vacancies v WHERE ${where}`,
  ]);

  const [mine, trust] = await Promise.all([
    findMyApplications(viewerUserId, rows.map((r) => r.id)),
    employerTrustMap(rows.map((r) => r.employerUserId)),
  ]);
  return {
    items: rows.map((row) => toJobDto(row, viewerUserId, mine.get(row.id) ?? null, trust.get(row.employerUserId)!)),
    total: countRows[0]?.total ?? 0,
    limit: params.limit,
    offset: params.offset,
  };
}

// Регион: распознанный субъект — код и название из справочника, иначе исходный текст.
// Для категорий справочника нет — label равен value.
export async function listJobFilters(viewerUserId: number) {
  const where = { status: 'published', employerUserId: { not: viewerUserId } };
  const [regionRows, categories] = await Promise.all([
    db.vacancy.findMany({
      where: { ...where, regionCode: { not: '' } },
      distinct: ['regionCode', 'regionSubject'],
      select: { regionCode: true, regionSubject: true },
    }),
    db.vacancy.findMany({
      where: { ...where, category: { not: '' } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    }),
  ]);
  const regions = new Map<string, string>();
  for (const r of regionRows) {
    const subject = regionDto(r.regionSubject);
    if (subject) regions.set(subject.code, subject.name);
    else regions.set(r.regionCode, r.regionCode);
  }
  return {
    regions: [...regions]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    categories: categories.map((c) => ({ value: c.category, label: c.category })),
  };
}

// Черновик, закрытая и несуществующая — одинаковый null, чтобы подбором ID их нельзя было различить.
// contactInfo здесь не отдаётся — только в истории после собственного отклика.
export async function getJob(viewerUserId: number, vacancyId: number): Promise<JobDto | null> {
  const rows = await db.$queryRaw<JobRow[]>`
    SELECT ${JOB_COLUMNS}
    FROM vacancies v JOIN users u ON u.id = v.employer_user_id
    WHERE v.id = ${vacancyId} AND v.status = 'published'`;
  const row = rows[0];
  if (!row) return null;
  const [mine, trust] = await Promise.all([
    findMyApplications(viewerUserId, [row.id]),
    employerTrustMap([row.employerUserId]),
  ]);
  return toJobDto(row, viewerUserId, mine.get(row.id) ?? null, trust.get(row.employerUserId)!);
}

export async function listMyApplications(
  viewerUserId: number,
  params: { status?: string; limit: number; offset: number }
) {
  const where = { candidateUserId: viewerUserId, ...(params.status ? { status: params.status } : {}) };
  const [rows, total] = await Promise.all([
    db.application.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit,
      skip: params.offset,
      select: {
        id: true,
        status: true,
        contact: true,
        startAt: true,
        shiftNote: true,
        attendance: true,
        createdAt: true,
        updatedAt: true,
        vacancy: {
          select: {
            id: true,
            title: true,
            regionCode: true,
            regionSubject: true,
            category: true,
            schedule: true,
            salaryMin: true,
            salaryMax: true,
            description: true,
            headcount: true,
            studentFriendly: true,
            badges: true,
            contactInfo: true,
            status: true,
            employerUserId: true,
            employer: { select: { displayName: true, companyName: true } },
          },
        },
      },
    }),
    db.application.count({ where }),
  ]);
  const [trust, timelines] = await Promise.all([
    employerTrustMap(rows.map((r) => r.vacancy.employerUserId)),
    loadTimelines(rows.map((r) => r.id)),
  ]);
  const items = rows.map(({ vacancy: { regionSubject, employerUserId, employer, ...vacancy }, ...application }) => ({
    ...application,
    timeline: timelines.get(application.id)!,
    vacancy: {
      ...vacancy,
      badges: resolveBadges(vacancy.badges, vacancy.studentFriendly),
      subject: regionDto(regionSubject),
      employer: { displayName: employer.companyName ?? employer.displayName, companyName: employer.companyName, ...trust.get(employerUserId)! },
    },
  }));
  return { items, total, limit: params.limit, offset: params.offset };
}

export interface ProfileDto {
  id: number;
  displayName: string | null;
  // Название компании для карточек вакансий; null — показывается displayName.
  companyName: string | null;
  applicationContact: string | null;
  hasBotChat: boolean;
  // Своя отметка «Надёжный работодатель»: сколько подтверждённых наймов и сколько нужно.
  employerTrust: EmployerTrust & { threshold: number };
}

const PROFILE_SELECT = { id: true, displayName: true, companyName: true, applicationContact: true, dialogChatId: true } as const;

function toProfileDto(user: { id: number; displayName: string | null; companyName: string | null; applicationContact: string | null; dialogChatId: string | null }): Omit<ProfileDto, 'employerTrust'> {
  return {
    id: user.id,
    displayName: user.displayName,
    companyName: user.companyName,
    applicationContact: user.applicationContact,
    // false — уведомлять некуда, пока пользователь не запустит бота в личном чате.
    hasBotChat: Boolean(user.dialogChatId),
  };
}

export async function getProfile(userId: number): Promise<ProfileDto | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  if (!user) return null;
  const trust = (await employerTrustMap([user.id])).get(user.id)!;
  return { ...toProfileDto(user), employerTrust: { ...trust, threshold: config.trustedEmployerMinHires } };
}

// Контакты уже отправленных откликов не меняются; название компании сразу видно во всех вакансиях.
export async function updateProfile(userId: number, data: { applicationContact?: string | null; companyName?: string | null }): Promise<ProfileDto | null> {
  const result = await db.user.updateMany({ where: { id: userId }, data });
  if (result.count === 0) return null;
  return getProfile(userId);
}
