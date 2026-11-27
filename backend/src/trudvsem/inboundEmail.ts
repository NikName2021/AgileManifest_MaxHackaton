import { createHash, randomBytes } from 'node:crypto';
import type { Vacancy } from '@prisma/client';
import { db } from '../db.js';
import { config } from '../config.js';
import { maxApi } from '../max/client.js';
import { escapeMarkdown } from '../markdown.js';
import { normalizeContact } from '../moderation.js';
import { normalizeForSearch } from '../suggest.js';
import { funnelButtons } from '../application/service.js';
import { recordEvents } from '../application/timeline.js';
import { parseEmail } from './mime.js';
import { TRUDVSEM_SOURCE } from './import.js';

// Email-to-Funnel: работодатель добавляет персональный адрес «Сезона» в уведомления личного
// кабинета «Работы России»; письма об откликах приходят на почтовый шлюз, он пересылает их в
// POST /webhook/inbound-email, а отклик появляется в воронке «Сезона» с источником trudvsem.
// Шаблон писем портала не документирован: разбор эвристический (ссылка на вакансию, название в
// кавычках, «Соискатель: …», телефон или почта в тексте) — его нужно сверить с настоящими письмами.

export const EXTERNAL_CANDIDATE_PREFIX = 'external:trudvsem:';

export async function inboundAddress(userId: number, rotate: boolean): Promise<{ address: string | null; enabled: boolean }> {
  if (!config.inboundEmailDomain) return { address: null, enabled: false };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { inboundEmailToken: true } });
  let token = user.inboundEmailToken;
  if (!token || rotate) {
    token = randomBytes(8).toString('hex');
    await db.user.update({ where: { id: userId }, data: { inboundEmailToken: token } });
  }
  return { address: `${token}@${config.inboundEmailDomain}`, enabled: true };
}

export interface ParsedResponse {
  vacancyExternalId: string | null;
  vacancyTitle: string | null;
  candidateName: string | null;
  contact: string | null;
  responseUrl: string | null;
}

const QUOTED = /[«"“]([^»"”\n]{2,200})[»"”]/;
const IGNORED_EMAIL = /@(?:[\w-]+\.)*trudvsem\.ru$|^no-?reply@|^mailer-daemon@/i;

export function parseTrudvsemResponse(subject: string, text: string): ParsedResponse {
  const all = `${subject}\n${text}`;
  const vacancyLink = /https?:\/\/(?:www\.)?trudvsem\.ru\/vacancy\/card\/\d+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(all);
  const anyLink = /https:\/\/(?:[\w-]+\.)*trudvsem\.ru\/[^\s"'<>)]*/i.exec(text);
  const titleMatch =
    /ваканси[июя]\s*[:\-—]?\s*[«"“]([^»"”\n]{2,200})[»"”]/i.exec(all) ??
    /ваканси[яи]\s*:\s*([^\n]{2,200})/i.exec(text) ??
    QUOTED.exec(subject);
  const nameMatch = /(?:соискатель|кандидат|фио)\s*[:\-—]\s*([A-ZА-ЯЁ][^\n,;:]{1,80})/i.exec(text);
  const emails = [...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0]).filter((e) => !IGNORED_EMAIL.test(e));
  const phones = [...text.matchAll(/(?:\+7|(?<!\d)8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)/g)].map((m) => m[0]);
  const contact = [...phones, ...emails].map((c) => normalizeContact(c)).find((c): c is string => c !== null) ?? null;
  return {
    vacancyExternalId: vacancyLink?.[1]?.toLowerCase() ?? null,
    vacancyTitle: titleMatch?.[1]?.trim() ?? null,
    candidateName: nameMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? null,
    contact,
    responseUrl: anyLink?.[0] ?? null,
  };
}

function recipients(headers: Map<string, string[]>, to?: string): string[] {
  const values = [to ?? '', ...['delivered-to', 'x-original-to', 'to', 'cc'].flatMap((h) => headers.get(h) ?? [])];
  return values.flatMap((v) => [...v.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g)].map((m) => m[0].toLowerCase()));
}

async function findVacancy(employerUserId: number, parsed: ParsedResponse): Promise<Vacancy | null> {
  if (parsed.vacancyExternalId) {
    const byId = await db.vacancy.findFirst({ where: { employerUserId, externalSource: TRUDVSEM_SOURCE, externalId: parsed.vacancyExternalId } });
    if (byId) return byId;
  }
  if (!parsed.vacancyTitle) return null;
  const wanted = normalizeForSearch(parsed.vacancyTitle);
  const candidates = await db.vacancy.findMany({ where: { employerUserId, status: { not: 'closed' } }, orderBy: { createdAt: 'desc' } });
  return candidates.find((v) => normalizeForSearch(v.title) === wanted) ?? null;
}

async function notifyEmployer(vacancy: Vacancy | null, employerUserId: number, text: string, buttons?: ReturnType<typeof funnelButtons>) {
  const employer = await db.user.findUnique({ where: { id: employerUserId } });
  const chatId = vacancy?.employerChatId || employer?.dialogChatId || employer?.chatId;
  if (!chatId) return;
  await maxApi.sendMessage(chatId, text, buttons).catch((err) => console.error('failed to notify employer about inbound email', employerUserId, err));
}

export type InboundStatus = 'created' | 'duplicate' | 'unmatched' | 'rejected';

export async function handleInboundEmail(raw: string, to?: string): Promise<{ status: InboundStatus; reason?: string; applicationId?: number; vacancyId?: number }> {
  const email = parseEmail(raw);
  const messageId = email.messageId ?? createHash('sha256').update(raw).digest('hex');
  if (await db.inboundEmail.findUnique({ where: { messageId } })) return { status: 'duplicate' };

  const log = (status: InboundStatus, data: { employerUserId?: number; reason?: string; applicationId?: number }) =>
    db.inboundEmail.create({ data: { messageId, status, ...data } }).catch(() => {});

  const domain = config.inboundEmailDomain?.toLowerCase();
  const token = domain
    ? recipients(email.headers, to).find((r) => r.endsWith(`@${domain}`))?.split('@')[0]
    : undefined;
  const employer = token ? await db.user.findUnique({ where: { inboundEmailToken: token } }) : null;
  if (!employer) {
    await log('rejected', { reason: 'unknown_recipient' });
    return { status: 'rejected', reason: 'unknown_recipient' };
  }

  // Принимаем только уведомления портала (письмо от trudvsem.ru или пересланное с его ссылками).
  if (!/trudvsem\.ru/i.test(email.from) && !/trudvsem\.ru/i.test(email.text)) {
    await log('rejected', { employerUserId: employer.id, reason: 'not_trudvsem' });
    return { status: 'rejected', reason: 'not_trudvsem' };
  }

  const parsed = parseTrudvsemResponse(email.subject, email.text);
  const vacancy = await findVacancy(employer.id, parsed);
  if (!vacancy) {
    await log('unmatched', { employerUserId: employer.id, reason: 'vacancy_not_found' });
    const title = parsed.vacancyTitle ? `«${escapeMarkdown(parsed.vacancyTitle)}»` : 'из письма';
    await notifyEmployer(null, employer.id,
      `Пришёл отклик с «Работы России» на вакансию ${title}, но в «Сезоне» такой вакансии нет. ` +
      'Импортируйте её из «Работы России» в мини-приложении — следующие отклики попадут в воронку сами.');
    return { status: 'unmatched', reason: 'vacancy_not_found' };
  }

  // Кандидат с портала — не пользователь MAX: заводим внешнего кандидата без чата с ботом.
  const key = parsed.contact ?? parsed.candidateName ?? messageId;
  const maxUserId = EXTERNAL_CANDIDATE_PREFIX + createHash('sha256').update(`${employer.id}|${key}`).digest('hex').slice(0, 24);
  const displayName = parsed.candidateName ?? 'Соискатель с «Работы России»';
  const candidate = await db.user.upsert({
    where: { maxUserId },
    update: { displayName },
    create: { maxUserId, chatId: '', displayName },
  });
  const existing = await db.application.findUnique({ where: { vacancyId_candidateUserId: { vacancyId: vacancy.id, candidateUserId: candidate.id } } });
  if (existing) {
    await log('duplicate', { employerUserId: employer.id, applicationId: existing.id });
    return { status: 'duplicate', applicationId: existing.id, vacancyId: vacancy.id };
  }

  const application = await db.$transaction(async (tx) => {
    const created = await tx.application.create({
      data: {
        vacancyId: vacancy.id,
        candidateUserId: candidate.id,
        status: 'new',
        source: TRUDVSEM_SOURCE,
        contact: parsed.contact ?? parsed.responseUrl ?? 'Отклик на «Работе России»',
        candidateChatId: null,
      },
    });
    await recordEvents(tx, [created.id], 'applied', created.createdAt);
    return created;
  });
  await log('created', { employerUserId: employer.id, applicationId: application.id });

  await notifyEmployer(vacancy, employer.id,
    `Новый отклик с «Работы России» на вакансию «${escapeMarkdown(vacancy.title)}»:\n` +
      `Кандидат: ${escapeMarkdown(displayName)}\n` +
      `Контакт: ${escapeMarkdown(application.contact ?? 'не указан')}\n` +
      'Кандидат пришёл не из MAX — сообщения об этапах ему не придут, свяжитесь с ним по контакту.',
    funnelButtons(application.id));
  return { status: 'created', applicationId: application.id, vacancyId: vacancy.id };
}
