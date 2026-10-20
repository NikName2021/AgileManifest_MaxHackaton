import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { escapeMarkdown } from '../markdown.js';
import { formatSalary, scheduleLabel } from '../vacancies/cardText.js';
import { createApplicationRecord, funnelButtons, handleApplyClick } from '../application/service.js';

// «Моя бригада»: люди, которых работодатель уже нанимал (статус hired), и повторное приглашение
// их на новую вакансию одним действием. Сезонный бизнес каждый год ищет во многом тех же людей.

export const TEAM_INVITE_LIMIT = 100;

export interface TeamMemberDto {
  candidate: { id: number; displayName: string | null };
  contact: string | null;
  hiredCount: number;
  lastHiredAt: Date | null;
  lastVacancy: { id: number; title: string };
  reliable: boolean;
  hasBotChat: boolean;
}

// Куда писать прошлому работнику: личный чат из bot_started, иначе чат его последнего отклика.
function deliveryChat(member: { dialogChatId: string | null }, lastCandidateChatId: string | null): string | null {
  return member.dialogChatId || lastCandidateChatId || null;
}

interface TeamRow {
  candidateUserId: number;
  displayName: string | null;
  dialogChatId: string | null;
  contact: string | null;
  candidateChatId: string | null;
  hiredCount: number;
  lastHiredAt: Date | null;
  lastVacancyId: number;
  lastVacancyTitle: string;
}

async function loadTeam(employerUserId: number): Promise<TeamRow[]> {
  const hired = await db.application.findMany({
    where: { status: 'hired', vacancy: { employerUserId }, candidateUserId: { not: employerUserId } },
    orderBy: [{ hiredAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    select: {
      candidateUserId: true,
      contact: true,
      candidateChatId: true,
      hiredAt: true,
      vacancy: { select: { id: true, title: true } },
      candidate: { select: { displayName: true, dialogChatId: true } },
    },
  });

  // Порядок — от последнего найма, поэтому первая встреченная запись кандидата самая свежая.
  const byCandidate = new Map<number, TeamRow>();
  for (const a of hired) {
    const row = byCandidate.get(a.candidateUserId);
    if (row) {
      row.hiredCount += 1;
      row.contact ??= a.contact;
      row.candidateChatId ??= a.candidateChatId;
      continue;
    }
    byCandidate.set(a.candidateUserId, {
      candidateUserId: a.candidateUserId,
      displayName: a.candidate.displayName,
      dialogChatId: a.candidate.dialogChatId,
      contact: a.contact,
      candidateChatId: a.candidateChatId,
      hiredCount: 1,
      lastHiredAt: a.hiredAt,
      lastVacancyId: a.vacancy.id,
      lastVacancyTitle: a.vacancy.title,
    });
  }
  return [...byCandidate.values()];
}

export async function listTeam(employerUserId: number): Promise<{ items: TeamMemberDto[]; total: number }> {
  const rows = await loadTeam(employerUserId);
  const marks = await db.teamMark.findMany({
    where: { employerUserId, candidateUserId: { in: rows.map((r) => r.candidateUserId) } },
    select: { candidateUserId: true, reliable: true },
  });
  const reliable = new Set(marks.filter((m) => m.reliable).map((m) => m.candidateUserId));

  const items = rows.map((r) => ({
    candidate: { id: r.candidateUserId, displayName: r.displayName },
    contact: r.contact,
    hiredCount: r.hiredCount,
    lastHiredAt: r.lastHiredAt,
    lastVacancy: { id: r.lastVacancyId, title: r.lastVacancyTitle },
    reliable: reliable.has(r.candidateUserId),
    hasBotChat: deliveryChat(r, r.candidateChatId) !== null,
  }));
  // Надёжные — наверху, внутри групп порядок по последнему найму сохраняется (sort стабилен).
  items.sort((a, b) => Number(b.reliable) - Number(a.reliable));
  return { items, total: items.length };
}

export async function setReliable(employerUserId: number, candidateUserId: number, reliable: boolean): Promise<boolean> {
  const wasHired = await db.application.count({
    where: { candidateUserId, status: 'hired', vacancy: { employerUserId } },
  });
  if (wasHired === 0) return false;
  await db.teamMark.upsert({
    where: { employerUserId_candidateUserId: { employerUserId, candidateUserId } },
    update: { reliable },
    create: { employerUserId, candidateUserId, reliable },
  });
  return true;
}

export type InviteOutcome =
  | 'sent'
  | 'already_invited'
  | 'already_applied'
  | 'no_bot_chat'
  | 'not_in_team'
  | 'delivery_failed'
  | 'limit_exceeded';

export type InviteTeamResult =
  | { ok: true; results: { candidateId: number; outcome: InviteOutcome }[] }
  | { ok: false; error: 'not_found' | 'forbidden' | 'vacancy_unavailable' };

function inviteButtons(inviteId: number): InlineButton[][] {
  return [[
    { type: 'callback', text: 'Приду', payload: `team_invite:${inviteId}:yes` },
    { type: 'callback', text: 'Не в этот раз', payload: `team_invite:${inviteId}:no` },
  ]];
}

function inviteText(vacancy: { title: string; regionCode: string; schedule: string; salaryMin: number | null; salaryMax: number | null }, employerName: string | null): string {
  const who = employerName ? escapeMarkdown(employerName) : 'Работодатель, у которого вы работали,';
  return [
    `${who} снова набирает людей и зовёт вас:`,
    `**${escapeMarkdown(vacancy.title)}**`,
    vacancy.regionCode ? `Регион: ${escapeMarkdown(vacancy.regionCode)}` : undefined,
    `График: ${escapeMarkdown(scheduleLabel(vacancy.schedule))}`,
    `Зарплата: ${formatSalary(vacancy.salaryMin, vacancy.salaryMax)}`,
    '',
    'Выйдете в этом сезоне?',
  ].filter((line) => line !== undefined).join('\n');
}

// candidateIds не задан — приглашаем всю бригаду. Повторный вызов безопасен: уже приглашённым
// второе сообщение не уходит, а тем, кому доставка не удалась, отправка повторяется.
export async function inviteTeam(employerUserId: number, vacancyId: number, candidateIds?: number[]): Promise<InviteTeamResult> {
  const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId }, include: { employer: true } });
  if (!vacancy) return { ok: false, error: 'not_found' };
  if (vacancy.employerUserId !== employerUserId) return { ok: false, error: 'forbidden' };
  if (vacancy.status !== 'published') return { ok: false, error: 'vacancy_unavailable' };

  const team = new Map((await loadTeam(employerUserId)).map((r) => [r.candidateUserId, r]));
  const targets = candidateIds ? [...new Set(candidateIds)] : [...team.keys()];
  const applied = new Set(
    (await db.application.findMany({
      where: { vacancyId, candidateUserId: { in: targets } },
      select: { candidateUserId: true },
    })).map((a) => a.candidateUserId)
  );

  const text = inviteText(vacancy, vacancy.employer.displayName);
  const results: { candidateId: number; outcome: InviteOutcome }[] = [];
  for (const candidateId of targets.slice(TEAM_INVITE_LIMIT)) {
    results.push({ candidateId, outcome: 'limit_exceeded' });
  }
  for (const candidateId of targets.slice(0, TEAM_INVITE_LIMIT)) {
    const member = team.get(candidateId);
    if (!member) { results.push({ candidateId, outcome: 'not_in_team' }); continue; }
    if (applied.has(candidateId)) { results.push({ candidateId, outcome: 'already_applied' }); continue; }
    const chatId = deliveryChat(member, member.candidateChatId);
    if (!chatId) { results.push({ candidateId, outcome: 'no_bot_chat' }); continue; }

    const invite = await claimInvite(vacancyId, candidateId);
    if (!invite) { results.push({ candidateId, outcome: 'already_invited' }); continue; }

    try {
      await maxApi.sendMessage(chatId, text, inviteButtons(invite.id));
      results.push({ candidateId, outcome: 'sent' });
    } catch (err) {
      console.error('failed to deliver team invite', invite.id, err);
      await db.teamInvite.update({ where: { id: invite.id }, data: { status: 'undelivered' } });
      results.push({ candidateId, outcome: 'delivery_failed' });
    }
  }
  return { ok: true, results };
}

// Новое приглашение или повтор недоставленного; null — уже приглашён (в том числе параллельным запросом).
async function claimInvite(vacancyId: number, candidateUserId: number) {
  try {
    return await db.teamInvite.create({ data: { vacancyId, candidateUserId } });
  } catch (err: any) {
    if (err?.code !== 'P2002') throw err;
  }
  const retried = await db.teamInvite.updateMany({
    where: { vacancyId, candidateUserId, status: 'undelivered' },
    data: { status: 'sent', createdAt: new Date() },
  });
  if (retried.count === 0) return null;
  return db.teamInvite.findUniqueOrThrow({ where: { vacancyId_candidateUserId: { vacancyId, candidateUserId } } });
}

export async function listInvites(employerUserId: number, vacancyId: number) {
  const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId }, select: { employerUserId: true } });
  if (!vacancy) return { ok: false as const, error: 'not_found' as const };
  if (vacancy.employerUserId !== employerUserId) return { ok: false as const, error: 'forbidden' as const };
  const invites = await db.teamInvite.findMany({
    where: { vacancyId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      status: true,
      createdAt: true,
      respondedAt: true,
      candidate: { select: { id: true, displayName: true } },
    },
  });
  return { ok: true as const, items: invites };
}

// Ответ прошлого работника кнопкой «Приду» / «Не в этот раз».
export async function handleTeamInviteResponse(chatId: string, senderMaxUserId: string, inviteId: number, answer: string) {
  if (answer !== 'yes' && answer !== 'no') return;
  const invite = await db.teamInvite.findUnique({
    where: { id: inviteId },
    include: { candidate: true, vacancy: { include: { employer: true } } },
  });
  if (!invite || invite.candidate.maxUserId !== senderMaxUserId) return;

  const { vacancy, candidate } = invite;
  const employerChatId = vacancy.employerChatId || vacancy.employer.dialogChatId || vacancy.employer.chatId;
  const title = escapeMarkdown(vacancy.title);
  const name = escapeMarkdown(candidate.displayName ?? 'без имени в MAX');

  const claimed = await db.teamInvite.updateMany({
    where: { id: inviteId, status: 'sent' },
    data: { status: answer === 'yes' ? 'accepted' : 'declined', respondedAt: new Date() },
  });
  if (claimed.count === 0) {
    await maxApi.sendMessage(chatId, 'Вы уже ответили на это приглашение.');
    return;
  }

  if (answer === 'no') {
    await maxApi.sendMessage(chatId, 'Понял, передам работодателю. Спасибо, что ответили!');
    await notify(employerChatId, `Из вашей бригады: ${name} не сможет выйти на «${title}» в этот раз.`);
    return;
  }

  const contact = await latestContact(candidate.id, vacancy.employerUserId) ?? candidate.applicationContact ?? candidate.phone;
  if (!contact) {
    // Контакта нет ни в прошлых откликах, ни в профиле — обычный путь отклика спросит его.
    await handleApplyClick(chatId, senderMaxUserId, vacancy.id, 'team');
    return;
  }

  const result = await createApplicationRecord({
    vacancyId: vacancy.id,
    candidateUserId: candidate.id,
    contact,
    candidateChatId: chatId,
    status: 'invited',
    source: 'team',
  });
  if (!result.ok) {
    if (result.error === 'already_applied') {
      await maxApi.sendMessage(chatId, 'Вы уже откликнулись на эту вакансию — работодатель вас видит.');
      return;
    }
    await db.teamInvite.update({ where: { id: inviteId }, data: { status: 'expired' } });
    await maxApi.sendMessage(chatId, 'К сожалению, эта вакансия уже закрыта.');
    return;
  }

  await maxApi.sendMessage(chatId, `Отлично! Передал работодателю, что вы выйдете на «${title}». С вами свяжутся.`);
  await notify(
    employerChatId,
    `Из вашей бригады: ${name} готов(а) выйти на «${title}».\nКонтакт: ${escapeMarkdown(contact)}`,
    funnelButtons(result.application.id)
  );
}

// Контакт, который кандидат оставлял этому работодателю в прошлый раз.
async function latestContact(candidateUserId: number, employerUserId: number): Promise<string | null> {
  const last = await db.application.findFirst({
    where: { candidateUserId, vacancy: { employerUserId }, contact: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { contact: true },
  });
  return last?.contact ?? null;
}

async function notify(chatId: string | null, text: string, buttons?: InlineButton[][]) {
  if (!chatId) return;
  try {
    await maxApi.sendMessage(chatId, text, buttons);
  } catch (err) {
    console.error('failed to notify employer about team invite answer', err);
  }
}
