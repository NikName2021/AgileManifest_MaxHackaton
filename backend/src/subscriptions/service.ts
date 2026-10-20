import { Prisma, type JobSubscription } from '@prisma/client';
import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { buildApplyDeepLink, buildVacancyCardText, MAX_CARD_TEXT_LIMIT, scheduleLabel } from '../vacancies/cardText.js';
import { regionDto, type RegionDto } from '../regions/service.js';
import { employerTrust } from '../employers/trust.js';

export const SUBSCRIPTIONS_PER_USER = 5;
// Верхняя граница рассылки одной вакансии — защита от неожиданного объёма без очереди сообщений.
export const MAX_RECIPIENTS_PER_VACANCY = 500;

export interface SubscriptionDto {
  id: number;
  region: RegionDto | null;
  category: string | null;
  schedule: string | null;
  salaryFrom: number | null;
  studentOnly: boolean;
  createdAt: Date;
}

export function toSubscriptionDto(s: JobSubscription): SubscriptionDto {
  return {
    id: s.id,
    region: regionDto(s.regionSubject),
    category: s.category,
    schedule: s.schedule,
    salaryFrom: s.salaryFrom,
    studentOnly: s.studentOnly,
    createdAt: s.createdAt,
  };
}

export async function listSubscriptions(userId: number) {
  const [items, user] = await Promise.all([
    db.jobSubscription.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    db.user.findUnique({ where: { id: userId }, select: { dialogChatId: true } }),
  ]);
  return { items: items.map(toSubscriptionDto), hasBotChat: Boolean(user?.dialogChatId) };
}

export type CreateSubscriptionResult =
  | { ok: true; subscription: SubscriptionDto }
  | { ok: false; error: 'limit_reached' };

export async function createSubscription(
  userId: number,
  filter: { regionSubject: string | null; category: string | null; schedule: string | null; salaryFrom: number | null; studentOnly: boolean }
): Promise<CreateSubscriptionResult> {
  // Сериализуем по пользователю, чтобы параллельные запросы не обошли лимит.
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const count = await tx.jobSubscription.count({ where: { userId } });
    if (count >= SUBSCRIPTIONS_PER_USER) return { ok: false as const, error: 'limit_reached' as const };
    const subscription = await tx.jobSubscription.create({ data: { userId, ...filter } });
    return { ok: true as const, subscription: toSubscriptionDto(subscription) };
  });
}

export async function deleteSubscription(userId: number, id: number): Promise<boolean> {
  const deleted = await db.jobSubscription.deleteMany({ where: { id, userId } });
  return deleted.count > 0;
}

export function describeSubscription(s: { regionSubject: string | null; category: string | null; schedule: string | null; salaryFrom: number | null; studentOnly: boolean }): string {
  const parts = [
    regionDto(s.regionSubject)?.name ?? 'вся Россия',
    s.category && s.category !== 'general' ? s.category : null,
    s.schedule ? `график: ${scheduleLabel(s.schedule)}` : null,
    s.salaryFrom !== null ? `от ${s.salaryFrom} ₽` : null,
    s.studentOnly ? 'для студентов' : null,
  ];
  return parts.filter(Boolean).join(', ');
}

// «Присылать похожие» из бота после отклика: тот же регион и категория, что у вакансии.
export async function subscribeLike(chatId: string, senderMaxUserId: string, vacancyId: number) {
  const [user, vacancy] = await Promise.all([
    db.user.findUnique({ where: { maxUserId: senderMaxUserId } }),
    db.vacancy.findUnique({ where: { id: vacancyId } }),
  ]);
  if (!user || !vacancy) return;
  const filter = {
    regionSubject: vacancy.regionSubject,
    category: vacancy.category !== 'general' ? vacancy.category : null,
    schedule: null,
    salaryFrom: null,
    studentOnly: false,
  };
  const existing = await db.jobSubscription.findFirst({ where: { userId: user.id, ...filter } });
  if (existing) {
    await maxApi.sendMessage(chatId, `Вы уже подписаны: ${describeSubscription(existing)}.`);
    return;
  }
  const result = await createSubscription(user.id, filter);
  if (!result.ok) {
    await maxApi.sendMessage(chatId, `У вас уже ${SUBSCRIPTIONS_PER_USER} подписок — лишние можно удалить в мини-приложении или командой /отписаться.`);
    return;
  }
  await maxApi.sendMessage(
    chatId,
    `Готово! Буду присылать новые вакансии: ${describeSubscription(filter)}.\nОтписаться — команда /отписаться.`
  );
}

export async function unsubscribe(chatId: string, senderMaxUserId: string, subscriptionId: number | 'all') {
  const user = await db.user.findUnique({ where: { maxUserId: senderMaxUserId } });
  if (!user) return;
  const deleted = await db.jobSubscription.deleteMany({
    where: { userId: user.id, ...(subscriptionId === 'all' ? {} : { id: subscriptionId }) },
  });
  await maxApi.sendMessage(
    chatId,
    deleted.count > 0 ? 'Подписка отменена — больше не буду присылать такие вакансии.' : 'Активных подписок нет.'
  );
}

interface Recipient {
  subscriptionId: number;
  userId: number;
  chatId: string;
}

// Подписчики, которым подходит вакансия: личный чат с ботом есть, это не сам работодатель,
// откликов и прошлой рассылки этой вакансии у них нет. Один человек — одно сообщение.
async function findRecipients(vacancyId: number): Promise<Recipient[]> {
  return db.$queryRaw<Recipient[]>`
    SELECT DISTINCT ON (s.user_id) s.id AS "subscriptionId", s.user_id AS "userId", u.dialog_chat_id AS "chatId"
    FROM job_subscriptions s
    JOIN users u ON u.id = s.user_id
    JOIN vacancies v ON v.id = ${vacancyId}
    WHERE v.status = 'published'
      AND u.dialog_chat_id IS NOT NULL
      AND s.user_id <> v.employer_user_id
      AND (s.region_subject IS NULL OR s.region_subject = v.region_subject)
      AND (s.category IS NULL OR s.category = v.category)
      AND (s.schedule IS NULL OR s.schedule = v.schedule)
      AND (s.salary_from IS NULL OR COALESCE(v.salary_max, v.salary_min) >= s.salary_from)
      AND (NOT s.student_only OR v.student_friendly)
      AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.vacancy_id = v.id AND a.candidate_user_id = s.user_id)
      AND NOT EXISTS (SELECT 1 FROM subscription_deliveries d WHERE d.vacancy_id = v.id AND d.user_id = s.user_id)
    ORDER BY s.user_id, s.id
    LIMIT ${MAX_RECIPIENTS_PER_VACANCY}`;
}

function notificationButtons(vacancyId: number, subscriptionId: number): InlineButton[][] {
  return [
    [{ type: 'callback', text: 'Откликнуться', payload: `apply:${vacancyId}:sub` }],
    [{ type: 'callback', text: 'Отписаться', payload: `unsub:${subscriptionId}` }],
  ];
}

export async function notifySubscribers(vacancyId: number): Promise<number> {
  const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId } });
  if (!vacancy || vacancy.status !== 'published') return 0;
  const { trusted } = await employerTrust(vacancy.employerUserId);
  const card = buildVacancyCardText({ ...vacancy, trustedEmployer: trusted }, buildApplyDeepLink(vacancy.id, undefined, 'sub'));
  const heading = 'Новая вакансия по вашей подписке:\n\n';
  const text = heading.length + card.length <= MAX_CARD_TEXT_LIMIT ? heading + card : card;

  let sent = 0;
  for (const r of await findRecipients(vacancyId)) {
    // Метка доставки ставится до отправки: параллельный запуск рассылки не отправит второй раз.
    try {
      await db.subscriptionDelivery.create({ data: { vacancyId, userId: r.userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
      throw err;
    }
    try {
      await maxApi.sendMessage(r.chatId, text, notificationButtons(vacancyId, r.subscriptionId));
      sent += 1;
    } catch (err) {
      console.error('failed to deliver subscription notice', vacancyId, r.userId, err);
    }
  }
  return sent;
}
