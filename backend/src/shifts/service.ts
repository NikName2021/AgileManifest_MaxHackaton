import type { Application, User, Vacancy } from '@prisma/client';
import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { escapeMarkdown } from '../markdown.js';
import { recordEvents } from '../application/timeline.js';

// Подтверждение выхода на смену: работодатель назначает время выхода приглашённому или нанятому
// кандидату, кандидат отвечает «Приду» / «Не смогу» сразу или после напоминания накануне.

const SHIFT_STATUSES = ['invited', 'hired'];
// Напоминаем, если до выхода осталось не больше 18 часов и кандидат ещё не ответил.
export const REMIND_BEFORE_MS = 18 * 3600 * 1000;
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

// Время — по Москве: в пилотных регионах (Кубань, Крым) это местное время.
export function formatShiftTime(date: Date): string {
  return `${dateFormat.format(date)} (МСК)`;
}

function attendanceButtons(applicationId: number): InlineButton[][] {
  return [[
    { type: 'callback', text: 'Приду', payload: `attend:${applicationId}:yes` },
    { type: 'callback', text: 'Не смогу', payload: `attend:${applicationId}:no` },
  ]];
}

type FullApplication = Application & { vacancy: Vacancy & { employer: User }; candidate: User };

function candidateChat(a: FullApplication): string | null {
  return a.candidateChatId || a.candidate.dialogChatId || null;
}

function shiftText(a: FullApplication, lead: string): string {
  return [
    `${lead} «${escapeMarkdown(a.vacancy.title)}»: ${formatShiftTime(a.startAt!)}.`,
    a.shiftNote ? `Где и что взять: ${escapeMarkdown(a.shiftNote)}` : undefined,
    'Подтвердите, пожалуйста, что придёте.',
  ].filter(Boolean).join('\n');
}

export type SetShiftResult =
  | { ok: true; application: Application; notified: boolean }
  | { ok: false; error: 'not_found' | 'forbidden' | 'invalid_status' | 'in_past' };

export async function setShift(employerUserId: number, applicationId: number, startAt: Date | null, note: string | null): Promise<SetShiftResult> {
  const current = await db.application.findUnique({
    where: { id: applicationId },
    include: { vacancy: { include: { employer: true } }, candidate: true },
  });
  if (!current) return { ok: false, error: 'not_found' };
  if (current.vacancy.employerUserId !== employerUserId) return { ok: false, error: 'forbidden' };
  if (startAt && !SHIFT_STATUSES.includes(current.status)) return { ok: false, error: 'invalid_status' };
  if (startAt && startAt.getTime() < Date.now()) return { ok: false, error: 'in_past' };

  // Новое время — новое подтверждение: прошлый ответ и напоминание сбрасываются.
  const updated = await db.application.update({
    where: { id: applicationId },
    data: startAt
      ? { startAt, shiftNote: note, attendance: 'pending', attendanceReminderSentAt: null }
      : { startAt: null, shiftNote: null, attendance: null, attendanceReminderSentAt: null },
    include: { vacancy: { include: { employer: true } }, candidate: true },
  });
  if (!startAt) return { ok: true, application: updated, notified: false };
  await recordEvents(db, [updated.id], 'shift_scheduled');

  const chatId = candidateChat(updated);
  if (!chatId) return { ok: true, application: updated, notified: false };
  try {
    await maxApi.sendMessage(chatId, shiftText(updated, 'Вас ждут на работе'), attendanceButtons(updated.id));
    return { ok: true, application: updated, notified: true };
  } catch (err) {
    console.error('failed to send shift notice', applicationId, err);
    return { ok: true, application: updated, notified: false };
  }
}

export async function handleAttendanceAnswer(chatId: string, senderMaxUserId: string, applicationId: number, answer: string) {
  if (answer !== 'yes' && answer !== 'no') return;
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { vacancy: { include: { employer: true } }, candidate: true },
  });
  if (!application || application.candidate.maxUserId !== senderMaxUserId || !application.startAt) return;

  const attendance = answer === 'yes' ? 'confirmed' : 'declined';
  // Ответ можно поменять («Приду» → «Не смогу»), повтор того же ответа ничего не отправляет.
  const changed = await db.application.updateMany({
    where: { id: applicationId, startAt: { not: null }, attendance: { not: attendance } },
    data: { attendance },
  });
  if (changed.count === 0) {
    await maxApi.sendMessage(chatId, 'Ответ уже сохранён, спасибо!');
    return;
  }
  await recordEvents(db, [applicationId], attendance === 'confirmed' ? 'shift_confirmed' : 'shift_declined');

  const name = escapeMarkdown(application.candidate.displayName ?? 'Кандидат');
  const title = escapeMarkdown(application.vacancy.title);
  const when = formatShiftTime(application.startAt);
  let employerText: string;
  if (attendance === 'confirmed') {
    await maxApi.sendMessage(chatId, 'Отлично, ждём вас! Если планы изменятся — нажмите «Не смогу» выше.');
    employerText = `${name} подтвердил(а) выход на «${title}» ${when}.`;
  } else {
    await maxApi.sendMessage(chatId, 'Поняли, предупредим работодателя. Спасибо, что сообщили заранее.');
    const reserve = await db.application.count({
      where: { vacancyId: application.vacancyId, status: { in: ['new', 'contacted'] } },
    });
    employerText = `${name} не сможет выйти на «${title}» ${when}.` +
      (reserve ? ` В воронке ещё ${reserve} кандидатов на этапах «Новый» и «На связи».` : ' Других кандидатов в воронке пока нет.');
  }

  const employerChatId = application.vacancy.employerChatId || application.vacancy.employer.dialogChatId || application.vacancy.employer.chatId;
  if (employerChatId) {
    await maxApi.sendMessage(employerChatId, employerText).catch((err) => console.error('failed to notify employer about attendance', applicationId, err));
  }
}

// Напоминание накануне тем, кто ещё не ответил. Помечаем только после успешной отправки.
export async function sendShiftRemindersOnce(now = new Date()): Promise<number> {
  const due = await db.application.findMany({
    where: {
      status: { in: SHIFT_STATUSES },
      attendance: 'pending',
      attendanceReminderSentAt: null,
      startAt: { gt: now, lte: new Date(now.getTime() + REMIND_BEFORE_MS) },
    },
    include: { vacancy: { include: { employer: true } }, candidate: true },
  });
  let sent = 0;
  for (const a of due) {
    const chatId = candidateChat(a);
    if (!chatId) continue;
    try {
      await maxApi.sendMessage(chatId, shiftText(a, 'Напоминаем: скоро выход на'), attendanceButtons(a.id));
      await db.application.update({ where: { id: a.id }, data: { attendanceReminderSentAt: new Date() } });
      sent += 1;
    } catch (err) {
      console.error('failed to send shift reminder, will retry', a.id, err);
    }
  }
  return sent;
}

export function startShiftReminders(): void {
  setInterval(() => {
    sendShiftRemindersOnce().catch((err) => console.error('shift reminder check failed', err));
  }, CHECK_INTERVAL_MS);
}
