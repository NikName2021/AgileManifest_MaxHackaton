import { Prisma } from '@prisma/client';
import { db } from '../db.js';

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
  category: string;
  schedule: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  status: string;
  createdAt: Date;
  employer: { displayName: string | null };
  myApplication: MyApplicationRef | null;
  canApply: boolean;
  applyUnavailableReason: ApplyUnavailableReason | null;
}

interface JobRow {
  id: number;
  title: string;
  regionCode: string;
  category: string;
  schedule: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  status: string;
  createdAt: Date;
  employerUserId: number;
  employerDisplayName: string | null;
}

function toJobDto(row: JobRow, viewerUserId: number, myApplication: MyApplicationRef | null): JobDto {
  const reason: ApplyUnavailableReason | null =
    row.employerUserId === viewerUserId ? 'own_vacancy' : myApplication ? 'already_applied' : null;
  return {
    id: row.id,
    title: row.title,
    regionCode: row.regionCode,
    category: row.category,
    schedule: row.schedule,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    // Поля «компания» нет — это имя пользователя в MAX.
    employer: { displayName: row.employerDisplayName },
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
  v.id, v.title, v.region_code AS "regionCode", v.category, v.schedule,
  v.salary_min AS "salaryMin", v.salary_max AS "salaryMax", v.description, v.status,
  v.created_at AS "createdAt", v.employer_user_id AS "employerUserId",
  u.display_name AS "employerDisplayName"`;

export interface ListJobsParams {
  q?: string;
  region_code?: string;
  category?: string;
  schedule?: string;
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
  if (regionCode) conditions.push(Prisma.sql`v.region_code = ${regionCode}`);
  const category = nonEmpty(params.category);
  if (category) conditions.push(Prisma.sql`v.category = ${category}`);
  if (params.schedule) conditions.push(Prisma.sql`v.schedule = ${params.schedule}`);

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

  const mine = await findMyApplications(viewerUserId, rows.map((r) => r.id));
  return {
    items: rows.map((row) => toJobDto(row, viewerUserId, mine.get(row.id) ?? null)),
    total: countRows[0]?.total ?? 0,
    limit: params.limit,
    offset: params.offset,
  };
}

// Справочника названий нет — label равен value.
export async function listJobFilters(viewerUserId: number) {
  const where = { status: 'published', employerUserId: { not: viewerUserId } };
  const [regions, categories] = await Promise.all([
    db.vacancy.findMany({
      where: { ...where, regionCode: { not: '' } },
      distinct: ['regionCode'],
      select: { regionCode: true },
      orderBy: { regionCode: 'asc' },
    }),
    db.vacancy.findMany({
      where: { ...where, category: { not: '' } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    }),
  ]);
  return {
    regions: regions.map((r) => ({ value: r.regionCode, label: r.regionCode })),
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
  const mine = await findMyApplications(viewerUserId, [row.id]);
  return toJobDto(row, viewerUserId, mine.get(row.id) ?? null);
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
        createdAt: true,
        updatedAt: true,
        vacancy: {
          select: {
            id: true,
            title: true,
            regionCode: true,
            category: true,
            schedule: true,
            salaryMin: true,
            salaryMax: true,
            description: true,
            contactInfo: true,
            status: true,
            employer: { select: { displayName: true } },
          },
        },
      },
    }),
    db.application.count({ where }),
  ]);
  return { items: rows, total, limit: params.limit, offset: params.offset };
}

export interface ProfileDto {
  id: number;
  displayName: string | null;
  applicationContact: string | null;
  hasBotChat: boolean;
}

const PROFILE_SELECT = { id: true, displayName: true, applicationContact: true, dialogChatId: true } as const;

function toProfileDto(user: { id: number; displayName: string | null; applicationContact: string | null; dialogChatId: string | null }): ProfileDto {
  return {
    id: user.id,
    displayName: user.displayName,
    applicationContact: user.applicationContact,
    // false — уведомлять некуда, пока пользователь не запустит бота в личном чате.
    hasBotChat: Boolean(user.dialogChatId),
  };
}

export async function getProfile(userId: number): Promise<ProfileDto | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  return user ? toProfileDto(user) : null;
}

// Контакты уже отправленных откликов не меняются.
export async function updateApplicationContact(userId: number, applicationContact: string | null): Promise<ProfileDto | null> {
  const result = await db.user.updateMany({ where: { id: userId }, data: { applicationContact } });
  if (result.count === 0) return null;
  return getProfile(userId);
}
