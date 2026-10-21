// Витрина «Сезона»: разнообразные демо-вакансии, кандидаты и отклики на разных этапах, чтобы в
// мини-приложении были данные. Запуск вручную, не при старте приложения:
//
//   ALLOW_SHOWCASE_SEED=true node prisma/seed-showcase.mjs [--owner-id=<id> | --owner-max-id=<MAX id>] [--remove]
//
// Повторный запуск пересоздаёт демо-данные; --remove только удаляет их. Настоящие пользователи и
// их данные не трогаются. Сообщения в MAX не отправляются: данные пишутся прямо в базу.
//
// --owner-id — ваш id в «Сезоне» (GET /api/me) или --owner-max-id — MAX id; аккаунт должен хоть раз
// открыть мини-приложение.
// Демо-хозяйство «Агрокомплекс «Южный»» с бригадой и откликами станет вашим, а от вашего имени
// появятся отклики на чужие вакансии — оба кабинета будут с данными. Если у аккаунта не задано
// название компании, на время демо им станет «Агрокомплекс «Южный»» (--remove его уберёт).
import { PrismaClient } from '@prisma/client';
import { APPLICATIONS, CANDIDATES, EMPLOYERS, OWNER_APPLICATIONS, VACANCIES } from './showcase-data.mjs';

if (process.env.ALLOW_SHOWCASE_SEED !== 'true') {
  throw new Error('Set ALLOW_SHOWCASE_SEED=true explicitly: the script recreates showcase data in this database.');
}

// Справочники — те же, что использует приложение (нужна сборка: npm run build).
const { normalizeRegion } = await import('../dist/regions/dictionary.js');
const { MAX_BADGES_PER_VACANCY, isBadgeKey, shownBadgeCount } = await import('../dist/vacancies/badges.js');
const { findContactLike, normalizeContactList } = await import('../dist/moderation.js');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

// Все демо-пользователи — с этим префиксом; все демо-вакансии — с этой меткой в card_message_id
// (поле доставки карточки в MAX: для каталога не используется, а повторную отправку блокирует).
const PREFIX = 'showcase:';
const MARK = 'showcase-seed';
const OWNER_COMPANY_NAME = EMPLOYERS.find((e) => e.key === 'south').name;

const db = new PrismaClient();
const NOW = Date.now();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const at = (ms) => new Date(ms);

async function removeShowcase() {
  const vacancies = await db.vacancy.findMany({
    where: { OR: [{ cardMessageId: MARK }, { employer: { maxUserId: { startsWith: PREFIX } } }] },
    select: { id: true },
  });
  const vacancyIds = vacancies.map((v) => v.id);
  const showcaseUsers = { maxUserId: { startsWith: PREFIX } };
  await db.teamInvite.deleteMany({ where: { OR: [{ vacancyId: { in: vacancyIds } }, { candidate: showcaseUsers }] } });
  await db.teamMark.deleteMany({ where: { OR: [{ employer: showcaseUsers }, { candidate: showcaseUsers }] } });
  await db.subscriptionDelivery.deleteMany({ where: { vacancyId: { in: vacancyIds } } });
  await db.channelDelivery.deleteMany({ where: { vacancyId: { in: vacancyIds } } });
  await db.pendingApplication.deleteMany({ where: { vacancyId: { in: vacancyIds } } });
  // События дорожной карты удаляются каскадом вместе с откликами.
  await db.application.deleteMany({ where: { OR: [{ vacancyId: { in: vacancyIds } }, { candidate: showcaseUsers }] } });
  await db.vacancy.deleteMany({ where: { id: { in: vacancyIds } } });
  await db.jobSubscription.deleteMany({ where: { user: showcaseUsers } });
  const users = await db.user.deleteMany({ where: showcaseUsers });
  // Название компании, выданное владельцу сидером; своё название владельца не трогается.
  await db.user.updateMany({ where: { companyName: OWNER_COMPANY_NAME }, data: { companyName: null } });
  return { vacancies: vacancyIds.length, users: users.count };
}

function checkData() {
  for (const v of VACANCIES) {
    for (const b of v.badges ?? []) if (!isBadgeKey(b)) throw new Error(`${v.key}: unknown badge ${b}`);
    if (shownBadgeCount(v.badges, v.studentFriendly) > MAX_BADGES_PER_VACANCY) throw new Error(`${v.key}: too many badges`);
    if (!normalizeRegion(v.region)) throw new Error(`${v.key}: region not recognised: ${v.region}`);
    // Те же правила модерации, что у API: контакты в тексте запрещены, контакт — в своём формате.
    for (const field of ['title', 'region', 'category', 'description']) {
      const kind = findContactLike(v[field] ?? '');
      if (kind) throw new Error(`${v.key}: ${field} contains a ${kind}`);
    }
    if (normalizeContactList(v.contact) !== v.contact) throw new Error(`${v.key}: invalid contact ${v.contact}`);
  }
}

// Время этапов отклика: доли пути от момента отклика до «сейчас» — всё строго в прошлом и по порядку.
const FRACTION = { viewed: 0.15, contacted: 0.3, invited: 0.45, shift_scheduled: 0.55, shift_confirmed: 0.65, rejected: 0.8, hired: 0.9 };

function planApplication(stage, daysAgo, source, withContacted) {
  const t0 = NOW - daysAgo * DAY;
  const t = (key) => at(t0 + FRACTION[key] * daysAgo * DAY);
  const events = [{ type: 'applied', createdAt: at(t0) }];
  const fields = { status: 'new', viewedAt: null, hiredAt: null, startAt: null, shiftNote: null, attendance: null };
  const fromTeam = source === 'team';

  if (fromTeam) {
    // Ответ «Приду» на приглашение бригады сразу создаёт отклик в статусе invited.
    events.push({ type: 'status:invited', createdAt: at(t0) });
    fields.status = 'invited';
  }
  if (stage === 'new') return { events, fields };

  fields.viewedAt = t('viewed');
  if (stage === 'viewed') return { events, fields };

  if (stage === 'rejected') {
    if (withContacted) events.push({ type: 'status:contacted', createdAt: t('contacted') });
    events.push({ type: 'status:rejected', createdAt: t('rejected') });
    return { events, fields: { ...fields, status: 'rejected' } };
  }
  if (withContacted && !fromTeam) events.push({ type: 'status:contacted', createdAt: t('contacted') });
  if (stage === 'contacted') return { events, fields: { ...fields, status: 'contacted' } };

  if (!fromTeam) events.push({ type: 'status:invited', createdAt: t('invited') });
  fields.status = 'invited';
  if (stage === 'invited') return { events, fields };

  // Смена: у нанятых — уже прошла, у подтвердивших — через пару дней.
  events.push({ type: 'shift_scheduled', createdAt: t('shift_scheduled') });
  events.push({ type: 'shift_confirmed', createdAt: t('shift_confirmed') });
  fields.attendance = 'confirmed';
  fields.shiftNote = 'Сбор у главных ворот, взять удобную обувь и головной убор';
  if (stage === 'shift_confirmed') {
    fields.startAt = at(NOW + 2 * DAY + 7 * HOUR - (NOW % DAY));
    return { events, fields };
  }
  // hired
  fields.startAt = at((t('shift_confirmed').getTime() + t('hired').getTime()) / 2);
  events.push({ type: 'status:hired', createdAt: t('hired') });
  return { events, fields: { ...fields, status: 'hired', hiredAt: t('hired') } };
}

// withContacted — проходил ли кандидат этап «На связи»: зависит от позиции в данных, а не от id,
// чтобы повторный запуск давал ту же историю.
async function createApplication(vacancy, candidate, plan, withContacted) {
  const { stage, daysAgo, source } = plan;
  const { events, fields } = planApplication(stage, daysAgo, source, withContacted);
  const last = events.at(-1).createdAt;
  return db.application.create({
    data: {
      vacancyId: vacancy.id,
      candidateUserId: candidate.id,
      contact: candidate.applicationContact ?? '@demo_candidate',
      candidateChatId: candidate.dialogChatId,
      source,
      createdAt: events[0].createdAt,
      updatedAt: last,
      ...fields,
      events: { create: events },
    },
  });
}

// Владелец — по MAX id или по id пользователя в «Сезоне» (поле id в GET /api/me, user_id при входе).
async function findOwner(ownerMaxId, ownerId) {
  if (!ownerMaxId && !ownerId) return null;
  const owner = ownerId
    ? await db.user.findUnique({ where: { id: Number(ownerId) || -1 } })
    : await db.user.findUnique({ where: { maxUserId: String(ownerMaxId) } });
  if (!owner) {
    throw new Error(`User ${ownerId ? `#${ownerId}` : `with MAX id ${ownerMaxId}`} not found — open the mini-app with this account once, then rerun.`);
  }
  if (owner.maxUserId.startsWith(PREFIX)) throw new Error('The owner must be a real account, not a showcase user.');
  return owner;
}

async function seed(owner) {

  const employers = {};
  for (const e of EMPLOYERS) {
    employers[e.key] =
      e.key === 'south' && owner
        ? owner
        : await db.user.create({ data: { maxUserId: `${PREFIX}employer:${e.key}`, chatId: '', displayName: e.name, companyName: e.name } });
  }
  if (owner && !owner.companyName) {
    await db.user.update({ where: { id: owner.id }, data: { companyName: OWNER_COMPANY_NAME } });
  }

  // У демо-кандидатов есть «личный чат» с ботом, иначе их подтверждённые выходы не засчитались бы
  // в отметку «Надёжный работодатель». Чаты фиктивные: сообщение им MAX не доставит.
  const candidates = [];
  for (const [i, name] of CANDIDATES.entries()) {
    const chatId = `${PREFIX}chat:${i}`;
    candidates.push(
      await db.user.create({
        data: {
          maxUserId: `${PREFIX}candidate:${i}`,
          chatId,
          dialogChatId: chatId,
          displayName: name,
          applicationContact: `@demo_candidate_${i + 1}`,
        },
      })
    );
  }

  const vacancies = {};
  for (const v of VACANCIES) {
    const employer = employers[v.employer];
    const createdAt = at(NOW - v.ageDays * DAY - 2 * HOUR);
    const status = v.status ?? 'published';
    vacancies[v.key] = await db.vacancy.create({
      data: {
        employerUserId: employer.id,
        title: v.title,
        regionCode: v.region,
        regionSubject: normalizeRegion(v.region),
        category: v.category,
        schedule: v.schedule,
        salaryMin: v.salaryMin,
        salaryMax: v.salaryMax,
        description: v.description,
        contactInfo: v.contact,
        headcount: v.headcount ?? null,
        studentFriendly: v.studentFriendly ?? false,
        badges: v.badges ?? [],
        status,
        cardMessageId: MARK,
        employerChatId: employer === owner ? owner.dialogChatId : null,
        createdAt,
        publishedAt: at(createdAt.getTime() + HOUR),
        closedAt: status === 'closed' ? at(Math.min(createdAt.getTime() + 60 * DAY, NOW - DAY)) : null,
        // Напоминание «нет откликов 48 часов» для демо-вакансий не нужно.
        reminderSentAt: at(NOW),
      },
    });
  }

  let applications = 0;
  for (const a of APPLICATIONS) {
    await createApplication(vacancies[a.vacancy], candidates[a.candidate], a, a.candidate % 2 === 0);
    applications += 1;
  }

  // «Моя бригада» «Южного»: двое отмечены надёжными, на новый сезон разосланы приглашения.
  const south = employers.south;
  await db.teamMark.createMany({
    data: [0, 1].map((c) => ({ employerUserId: south.id, candidateUserId: candidates[c].id, reliable: true })),
  });
  const invites = [
    { candidate: 0, status: 'accepted' },
    { candidate: 1, status: 'accepted' },
    { candidate: 2, status: 'sent' },
    { candidate: 3, status: 'declined' },
  ];
  for (const inv of invites) {
    const createdAt = at(NOW - 1.1 * DAY);
    await db.teamInvite.create({
      data: {
        vacancyId: vacancies.south_harvest.id,
        candidateUserId: candidates[inv.candidate].id,
        status: inv.status,
        createdAt,
        respondedAt: inv.status === 'sent' ? null : at(createdAt.getTime() + 2 * HOUR),
      },
    });
  }

  if (owner) {
    for (const a of OWNER_APPLICATIONS) {
      await createApplication(vacancies[a.vacancy], owner, a, false);
      applications += 1;
    }
    // Черновик в кабинете работодателя.
    await db.vacancy.create({
      data: {
        employerUserId: owner.id,
        title: 'Упаковщик фруктов',
        regionCode: 'Краснодарский край',
        regionSubject: '23',
        category: 'Сельское хозяйство',
        schedule: 'seasonal',
        salaryMin: 55000,
        salaryMax: 65000,
        description: 'Упаковка черешни в ящики на складе, смена 8 часов.',
        contactInfo: VACANCIES[0].contact,
        headcount: 4,
        badges: ['meals_2', 'shuttle'],
        status: 'draft',
        cardMessageId: MARK,
        employerChatId: owner.dialogChatId,
        reminderSentAt: at(NOW),
      },
    });
  }

  return {
    employers: Object.keys(employers).length,
    candidates: candidates.length,
    vacancies: VACANCIES.length + (owner ? 1 : 0),
    applications,
    owner: owner ? { id: owner.id, displayName: owner.displayName } : null,
  };
}

try {
  // Сначала все проверки, потом удаление: при ошибке старые демо-данные остаются на месте.
  checkData();
  const owner = args.remove ? null : await findOwner(args['owner-max-id'], args['owner-id']);
  const removed = await removeShowcase();
  if (args.remove) {
    console.log(JSON.stringify({ removed }, null, 2));
  } else {
    console.log(JSON.stringify({ removed, created: await seed(owner) }, null, 2));
  }
} finally {
  await db.$disconnect();
}
