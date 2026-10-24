import { Prisma, type PartnerChannel, type Vacancy } from '@prisma/client';
import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { escapeMarkdown } from '../markdown.js';
import { findOrCreateUserByMaxId } from '../users/service.js';
import { buildApplyDeepLink, buildVacancyCardText, employmentLabel, formatSalary, MAX_CARD_TEXT_LIMIT } from '../vacancies/cardText.js';
import { resolveBadges, type BadgeDef } from '../vacancies/badges.js';
import { regionDto, type RegionDto } from '../regions/service.js';
import { employerTrust, employerTrustMap } from '../employers/trust.js';

export const CHANNEL_MODES = ['instant', 'digest'] as const;
export type ChannelMode = (typeof CHANNEL_MODES)[number];

// Сколько вакансий попадает в один дайджест: больше — пост превращается в простыню.
export const DIGEST_MAX_VACANCIES = 10;
// Час дайджеста задаётся по Москве (UTC+3, без перехода на летнее время).
const MSK_OFFSET_HOURS = 3;
const DIGEST_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface PartnerChannelStats {
  // Сколько вакансий бот опубликовал в канале (сразу или в дайджесте).
  vacanciesPosted: number;
  // Сколько откликов пришло по ссылкам из постов этого канала и сколько из них нанято.
  applications: number;
  hired: number;
  lastPostedAt: Date | null;
}

export interface PartnerChannelDto {
  id: number;
  title: string | null;
  isChannel: boolean;
  active: boolean;
  region: RegionDto | null;
  studentOnly: boolean;
  categories: string[];
  schedule: string | null;
  salaryFrom: number | null;
  trustedOnly: boolean;
  badges: BadgeDef[];
  mode: ChannelMode;
  digestHour: number;
  removed: boolean;
  createdAt: Date;
  stats: PartnerChannelStats;
}

const EMPTY_STATS: PartnerChannelStats = { vacanciesPosted: 0, applications: 0, hired: 0, lastPostedAt: null };

function toDto(c: PartnerChannel, stats: PartnerChannelStats = EMPTY_STATS): PartnerChannelDto {
  return {
    id: c.id,
    title: c.title,
    isChannel: c.isChannel,
    active: c.active && !c.removedAt,
    region: regionDto(c.regionSubject),
    studentOnly: c.studentOnly,
    categories: c.categories,
    schedule: c.schedule,
    salaryFrom: c.salaryFrom,
    trustedOnly: c.trustedOnly,
    badges: resolveBadges(c.badges),
    mode: c.mode as ChannelMode,
    digestHour: c.digestHour,
    removed: c.removedAt !== null,
    createdAt: c.createdAt,
    stats,
  };
}

async function fetchTitle(chatId: string): Promise<string | null> {
  try {
    const chat = (await maxApi.getChat(chatId)) as { title?: string | null } | undefined;
    return chat?.title ?? null;
  } catch {
    return null;
  }
}

// bot_added: бота добавили в чат или канал. Тот, кто добавил, становится владельцем канала-партнёра.
// Публикация не включается сама — владелец включает её в мини-приложении.
export async function handleBotAdded(chatId: string, user: { id: string; name?: string }, isChannel: boolean) {
  const owner = await findOrCreateUserByMaxId(user.id, user.name);
  const title = await fetchTitle(chatId);
  await db.partnerChannel.upsert({
    where: { chatId },
    update: { ownerUserId: owner.id, isChannel, removedAt: null, ...(title ? { title } : {}) },
    create: { chatId, ownerUserId: owner.id, isChannel, title },
  });
  if (owner.dialogChatId) {
    const where = title ? `«${title}»` : isChannel ? 'канал' : 'чат';
    await maxApi
      .sendMessage(
        owner.dialogChatId,
        `Бот добавлен в ${where}. Чтобы туда автоматически публиковались подходящие вакансии, ` +
          'включите публикацию и выберите фильтры в мини-приложении «Сезон» → «Каналы».'
      )
      .catch((err) => console.error('failed to notify channel owner', chatId, err));
  }
}

export async function isPartnerChat(chatId: string): Promise<boolean> {
  return (await db.partnerChannel.count({ where: { chatId, removedAt: null } })) > 0;
}

export async function handleBotRemoved(chatId: string) {
  await db.partnerChannel.updateMany({ where: { chatId, removedAt: null }, data: { removedAt: new Date() } });
}

// Статистика одним запросом на таблицу для всех каналов владельца, без N+1.
async function loadStats(channelIds: number[]): Promise<Map<number, PartnerChannelStats>> {
  const stats = new Map<number, PartnerChannelStats>(channelIds.map((id) => [id, { ...EMPTY_STATS }]));
  if (channelIds.length === 0) return stats;
  const [posted, applications] = await Promise.all([
    db.channelDelivery.groupBy({
      by: ['channelId'],
      where: { channelId: { in: channelIds } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    db.$queryRaw<{ channelId: number; total: number; hired: number }[]>`
      SELECT partner_channel_id AS "channelId", COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'hired')::int AS hired
      FROM applications
      WHERE partner_channel_id IN (${Prisma.join(channelIds)})
      GROUP BY partner_channel_id`,
  ]);
  for (const p of posted) {
    Object.assign(stats.get(p.channelId)!, { vacanciesPosted: p._count._all, lastPostedAt: p._max.createdAt });
  }
  for (const a of applications) {
    Object.assign(stats.get(a.channelId)!, { applications: a.total, hired: a.hired });
  }
  return stats;
}

export async function listChannels(ownerUserId: number) {
  const items = await db.partnerChannel.findMany({ where: { ownerUserId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const stats = await loadStats(items.map((c) => c.id));
  return { items: items.map((c) => toDto(c, stats.get(c.id))) };
}

export interface ChannelPatch {
  active?: boolean;
  regionSubject?: string | null;
  studentOnly?: boolean;
  categories?: string[];
  schedule?: string | null;
  salaryFrom?: number | null;
  trustedOnly?: boolean;
  badges?: string[];
  mode?: ChannelMode;
  digestHour?: number;
}

export async function updateChannel(ownerUserId: number, id: number, patch: ChannelPatch): Promise<PartnerChannelDto | 'not_found' | 'removed'> {
  const channel = await db.partnerChannel.findFirst({ where: { id, ownerUserId } });
  if (!channel) return 'not_found';
  if (channel.removedAt && patch.active) return 'removed';
  // Переход в дайджест: в первый дайджест попадут вакансии, опубликованные с этого момента.
  const digestStart = patch.mode === 'digest' && channel.mode !== 'digest' ? { lastDigestAt: new Date() } : {};
  const updated = await db.partnerChannel.update({ where: { id }, data: { ...patch, ...digestStart } });
  return toDto(updated, (await loadStats([id])).get(id));
}

// Подходит ли вакансия под фильтры канала. Пустой список и null — «любое значение».
export function matchesChannel(channel: PartnerChannel, vacancy: Vacancy, trusted: boolean): boolean {
  if (channel.regionSubject && channel.regionSubject !== vacancy.regionSubject) return false;
  if (channel.studentOnly && !vacancy.studentFriendly) return false;
  if (channel.categories.length > 0 && !channel.categories.includes(vacancy.category)) return false;
  if (channel.schedule && channel.schedule !== vacancy.schedule) return false;
  if (channel.salaryFrom !== null && (vacancy.salaryMax ?? vacancy.salaryMin ?? -1) < channel.salaryFrom) return false;
  if (channel.trustedOnly && !trusted) return false;
  const badges = new Set(vacancy.badges);
  return channel.badges.every((key) => badges.has(key));
}

// В канале нажатие callback-кнопки пришло бы с chat_id канала, и бот ответил бы прямо туда,
// поэтому кнопка — ссылка: она открывает личный чат с ботом.
function channelButtons(url: string | null): InlineButton[][] | undefined {
  return url ? [[{ type: 'link', text: 'Откликнуться', url }]] : undefined;
}

// Ссылка с номером канала (apply_<id>_ch<channelId>) — отклик засчитается в статистику канала.
function channelApplyLink(vacancyId: number, channelId: number): string | null {
  return buildApplyDeepLink(vacancyId, undefined, `ch${channelId}`);
}

// false — вакансию в этот канал уже отправляли (повторная публикация, параллельный вызов).
async function claimDelivery(vacancyId: number, channelId: number): Promise<boolean> {
  try {
    await db.channelDelivery.create({ data: { vacancyId, channelId } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
    throw err;
  }
}

// Режим instant: вакансия уходит в подходящие каналы сразу после публикации.
export async function notifyPartnerChannels(vacancyId: number): Promise<number> {
  const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId } });
  if (!vacancy || vacancy.status !== 'published') return 0;

  const { trusted } = await employerTrust(vacancy.employerUserId);
  const channels = (await db.partnerChannel.findMany({ where: { active: true, removedAt: null, mode: 'instant' } }))
    .filter((c) => matchesChannel(c, vacancy, trusted));

  let sent = 0;
  for (const channel of channels) {
    if (!(await claimDelivery(vacancyId, channel.id))) continue;
    const url = channelApplyLink(vacancy.id, channel.id);
    try {
      await maxApi.sendMessage(channel.chatId, buildVacancyCardText({ ...vacancy, trustedEmployer: trusted }, url), channelButtons(url));
      sent += 1;
    } catch (err) {
      console.error('failed to post vacancy to partner channel', vacancyId, channel.id, err);
    }
  }
  return sent;
}

// Момент сегодняшнего дайджеста канала (digestHour по Москве) в UTC.
export function digestMoment(now: Date, digestHour: number): Date {
  const msk = new Date(now.getTime() + MSK_OFFSET_HOURS * 3600 * 1000);
  return new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate(), digestHour - MSK_OFFSET_HOURS));
}

function digestItem(index: number, vacancy: Vacancy, url: string | null): string {
  const place = [vacancy.regionCode || undefined, employmentLabel(vacancy.schedule)].filter(Boolean).join(' · ');
  return [
    `${index}\\. **${escapeMarkdown(vacancy.title)}** — ${escapeMarkdown(formatSalary(vacancy.salaryMin, vacancy.salaryMax))}`,
    escapeMarkdown(place),
    url ? `[Откликнуться](${url})` : undefined,
  ].filter(Boolean).join('\n');
}

// Один пост со списком вакансий; пункты, не влезающие в лимит MAX, не добавляются.
export function buildDigestText(items: { vacancy: Vacancy; url: string | null }[]): { text: string; count: number } {
  const header = '**Новые вакансии за сутки**';
  let text = header;
  let count = 0;
  for (const { vacancy, url } of items) {
    const next = `${text}\n\n${digestItem(count + 1, vacancy, url)}`;
    if (next.length > MAX_CARD_TEXT_LIMIT) break;
    text = next;
    count += 1;
  }
  return { text, count };
}

// Режим digest: раз в день в digestHour (МСК) — одним постом новые подходящие вакансии с прошлого
// дайджеста. Нечего показать — пост не отправляется, но день считается пройденным.
export async function sendChannelDigestsOnce(now = new Date()): Promise<number> {
  const channels = await db.partnerChannel.findMany({ where: { active: true, removedAt: null, mode: 'digest' } });
  let posts = 0;
  for (const channel of channels) {
    const moment = digestMoment(now, channel.digestHour);
    if (now < moment || (channel.lastDigestAt && channel.lastDigestAt >= moment)) continue;
    // Условное обновление — защита от двух параллельных прогонов (несколько экземпляров сервера).
    const claimed = await db.partnerChannel.updateMany({
      where: { id: channel.id, OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: moment } }] },
      data: { lastDigestAt: now },
    });
    if (claimed.count === 0) continue;

    const since = channel.lastDigestAt ?? new Date(moment.getTime() - 24 * 3600 * 1000);
    const delivered = await db.channelDelivery.findMany({ where: { channelId: channel.id, createdAt: { gt: since } }, select: { vacancyId: true } });
    const candidates = await db.vacancy.findMany({
      where: { status: 'published', publishedAt: { gt: since }, id: { notIn: delivered.map((d) => d.vacancyId) } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const trust = await employerTrustMap(candidates.map((v) => v.employerUserId));
    const matching = candidates
      .filter((v) => matchesChannel(channel, v, trust.get(v.employerUserId)?.trusted ?? false))
      .slice(0, DIGEST_MAX_VACANCIES);
    if (matching.length === 0) continue;

    const { text, count } = buildDigestText(matching.map((v) => ({ vacancy: v, url: channelApplyLink(v.id, channel.id) })));
    const included = matching.slice(0, count);
    await db.channelDelivery.createMany({ data: included.map((v) => ({ vacancyId: v.id, channelId: channel.id })), skipDuplicates: true });
    try {
      await maxApi.sendMessage(channel.chatId, text);
      posts += 1;
    } catch (err) {
      console.error('failed to post digest to partner channel', channel.id, err);
    }
  }
  return posts;
}

export function startChannelDigests(): void {
  setInterval(() => {
    sendChannelDigestsOnce().catch((err) => console.error('partner channel digest failed', err));
  }, DIGEST_CHECK_INTERVAL_MS);
}

// Отклик из поста канала: номер канала из ссылки принимается, только если такой канал есть.
export async function knownChannelId(channelId: number | undefined): Promise<number | null> {
  if (!channelId) return null;
  return (await db.partnerChannel.count({ where: { id: channelId } })) > 0 ? channelId : null;
}
