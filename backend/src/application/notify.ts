import { db } from '../db.js';
import { maxApi } from '../max/client.js';
import { escapeMarkdown } from '../markdown.js';
import type { Application, User, Vacancy } from '@prisma/client';

// Уведомления кандидату об этапе отклика с антиспамом. Кандидату не чаще одного сообщения за
// CANDIDATE_NOTIFY_COOLDOWN_MS на отклик: смена этапа внутри этого окна откладывается, и по его
// окончании уходит одно сообщение с итоговым этапом. Если работодатель вернул этап, о котором
// кандидату уже сообщили, ничего не отправляется.
export const CANDIDATE_NOTIFY_COOLDOWN_MS = 2 * 60 * 1000;
const PENDING_CHECK_INTERVAL_MS = 15 * 1000;

// О чём сообщаем: этап отклика или «работодатель посмотрел» (этап ещё «Новый», но viewedAt есть).
export type NotifyState = 'viewed' | 'contacted' | 'invited' | 'hired' | 'rejected';

// sent — отправлено сейчас; deferred — уйдёт по окончании окна антиспама; none — сообщать нечего
// (этап «Новый» или кандидат уже знает об этом этапе); no_chat — боту некуда написать; failed — MAX
// вернул ошибку.
export type NotifyOutcome = 'sent' | 'deferred' | 'none' | 'no_chat' | 'failed';

export interface NotifyResult {
  outcome: NotifyOutcome;
  // Для deferred — когда уйдёт сообщение.
  at?: Date;
  error?: string;
}

type FullApplication = Application & { vacancy: Vacancy; candidate: User };

function stateOf(application: Application): NotifyState | null {
  if (application.status === 'new') return application.viewedAt ? 'viewed' : null;
  return application.status as NotifyState;
}

// После приглашения кандидату открывается контакт работодателя — он же приходит в сообщении.
export function candidateMessage(state: NotifyState, vacancyTitle: string, contactInfo: string | null): string {
  const title = escapeMarkdown(vacancyTitle);
  const contact = contactInfo ? `\nКонтакт работодателя: ${escapeMarkdown(contactInfo)}` : '';
  switch (state) {
    case 'viewed':
      return `Работодатель посмотрел ваш отклик на вакансию «${title}». Ответ придёт сюда.`;
    case 'contacted':
      return `Работодатель вышел на связь по вакансии «${title}» — ждите звонка или сообщения на контакт из отклика.`;
    case 'invited':
      return `Хорошие новости! Вас пригласили на вакансию «${title}». Работодатель свяжется с вами.${contact}`;
    case 'hired':
      return `Поздравляем! Вас приняли на вакансию «${title}».${contact}`;
    case 'rejected':
      return `По вакансии «${title}», к сожалению, вам отказали.`;
  }
}

// Куда писать: чат отклика, затем личный чат с ботом, затем по user_id (человек открыл только
// мини-приложение). У тестовых и демо-аккаунтов user_id не числовой — по нему не пишем.
async function deliver(application: FullApplication, text: string): Promise<NotifyResult> {
  const chatId = application.candidateChatId || application.candidate.dialogChatId;
  const userId = /^\d+$/.test(application.candidate.maxUserId) ? application.candidate.maxUserId : null;
  if (!chatId && !userId) return { outcome: 'no_chat' };
  try {
    if (chatId) await maxApi.sendMessage(chatId, text);
    else await maxApi.sendMessageToUser(userId!, text);
    return { outcome: 'sent' };
  } catch (err: any) {
    console.error('failed to notify candidate about application stage', application.id, err);
    // Без личного чата MAX может не принять сообщение по user_id — для работодателя это «нет чата».
    return chatId ? { outcome: 'failed', error: err?.message ?? String(err) } : { outcome: 'no_chat' };
  }
}

// Сообщить кандидату текущий этап отклика с учётом антиспама. Безопасно вызывать повторно и
// параллельно: отправку «занимает» условное обновление notified_at.
export async function notifyCandidate(applicationId: number, now = new Date()): Promise<NotifyResult> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { vacancy: true, candidate: true },
  });
  if (!application) return { outcome: 'none' };

  const state = stateOf(application);
  if (!state || state === application.notifiedStatus) {
    if (application.pendingNotifyAt) {
      await db.application.updateMany({ where: { id: applicationId }, data: { pendingNotifyAt: null } });
    }
    return { outcome: 'none' };
  }

  const nextAllowed = application.notifiedAt ? new Date(application.notifiedAt.getTime() + CANDIDATE_NOTIFY_COOLDOWN_MS) : null;
  if (nextAllowed && nextAllowed > now) {
    await db.application.updateMany({ where: { id: applicationId }, data: { pendingNotifyAt: nextAllowed } });
    return { outcome: 'deferred', at: nextAllowed };
  }

  const claimed = await db.application.updateMany({
    where: { id: applicationId, notifiedAt: application.notifiedAt },
    data: { notifiedStatus: state, notifiedAt: now, pendingNotifyAt: null },
  });
  // Параллельный вызов уже отправил сообщение — этот уходит в отложенные.
  if (claimed.count === 0) return notifyCandidate(applicationId, now);

  const result = await deliver(application, candidateMessage(state, application.vacancy.title, application.vacancy.contactInfo));
  if (result.outcome !== 'sent') {
    // Не доставили — не считаем сообщённым, чтобы следующий этап не оказался «повтором».
    await db.application.updateMany({
      where: { id: applicationId, notifiedAt: now },
      data: { notifiedStatus: application.notifiedStatus, notifiedAt: application.notifiedAt },
    });
  }
  return result;
}

// Работодатель впервые открыл отклики — сообщение «посмотрел» уходит фоном (не задерживает ответ
// API), через обработку отложенных уведомлений.
export async function scheduleViewedNotifications(applicationIds: number[], now = new Date()): Promise<void> {
  if (applicationIds.length === 0) return;
  await db.application.updateMany({
    where: { id: { in: applicationIds }, status: 'new', notifiedStatus: null, pendingNotifyAt: null },
    data: { pendingNotifyAt: now },
  });
}

// Отложенные сообщения, у которых подошло время. Каждое занимается условным обновлением, поэтому
// несколько экземпляров сервера не отправят одно сообщение дважды.
export async function sendPendingCandidateNotificationsOnce(now = new Date()): Promise<number> {
  const due = await db.application.findMany({
    where: { pendingNotifyAt: { lte: now } },
    select: { id: true, pendingNotifyAt: true },
    orderBy: { pendingNotifyAt: 'asc' },
    take: 100,
  });
  let sent = 0;
  for (const item of due) {
    const claimed = await db.application.updateMany({
      where: { id: item.id, pendingNotifyAt: item.pendingNotifyAt },
      data: { pendingNotifyAt: null },
    });
    if (claimed.count === 0) continue;
    if ((await notifyCandidate(item.id, now)).outcome === 'sent') sent += 1;
  }
  return sent;
}

export function startCandidateNotifications(): void {
  setInterval(() => {
    sendPendingCandidateNotificationsOnce().catch((err) => console.error('pending candidate notifications failed', err));
  }, PENDING_CHECK_INTERVAL_MS);
}
