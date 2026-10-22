import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { escapeMarkdown } from '../markdown.js';
import { APPLICATION_CONTACT_MAX_LENGTH } from '../validation.js';
import { markViewed, recordEvents, type EventType } from './timeline.js';
import { hasForbiddenChars, normalizeSingleLine } from '../text.js';
import { CONTACT_FORMAT_HINT, normalizeContact } from '../moderation.js';
import { knownChannelId } from '../channels/service.js';
import type { Application, User, Vacancy } from '@prisma/client';

const VALID_STATUSES = ['new', 'contacted', 'invited', 'hired', 'rejected'];

function statusLabel(status: string): string {
    const labels: Record<string, string> = {
        new: 'Новый',
        contacted: 'На связи',
        invited: 'Приглашён',
        hired: 'Нанят',
        rejected: 'Отказ',
    };
    return labels[status] ?? status;
}

// После приглашения кандидату открывается контакт работодателя — он же приходит в сообщении.
function statusMessageForCandidate(status: string, vacancyTitle: string, contactInfo: string | null): string | undefined {
    const title = escapeMarkdown(vacancyTitle);
    const contact = contactInfo ? `
Контакт работодателя: ${escapeMarkdown(contactInfo)}` : '';
    if (status === 'invited') {
        return `Хорошие новости! Вас пригласили на вакансию «${title}». Работодатель свяжется с вами.${contact}`;
    }
    if (status === 'hired') {
        return `Поздравляем! Вас приняли на вакансию «${title}».${contact}`;
    }
    if (status === 'rejected') {
        return `По вакансии «${title}», к сожалению, вам отказали.`;
    }
    // contacted и возврат в new — без уведомления.
    return undefined;
}

export function funnelButtons(applicationId: number): InlineButton[][] {
    return [
        [
            { type: 'callback', text: 'На связи', payload: `app_status:${applicationId}:contacted` },
            { type: 'callback', text: 'Пригласить', payload: `app_status:${applicationId}:invited` },
        ],
        [
            { type: 'callback', text: 'Нанять', payload: `app_status:${applicationId}:hired` },
            { type: 'callback', text: 'Отказать', payload: `app_status:${applicationId}:rejected` },
        ],
    ];
}

// Откуда пришёл отклик: card — кнопка на карточке в чате, link — ссылка без метки, qr — QR-объявление,
// subscription — рассылка по подписке, channel — канал партнёра, miniapp — мини-приложение,
// team — ответ на приглашение «Моей бригады».
export type ApplicationSource = 'card' | 'link' | 'qr' | 'subscription' | 'channel' | 'miniapp' | 'team';

export type CreateApplicationError = 'not_found' | 'vacancy_unavailable' | 'self_application_forbidden' | 'already_applied';

export type CreateApplicationResult =
    | { ok: true; application: Application }
    | { ok: false; error: CreateApplicationError };

// Общая точка для REST и бота. Проверка статуса и вставка — в одной транзакции под FOR SHARE на
// строке вакансии: закрытие (UPDATE) ждёт блокировку, а отклик после закрытия перечитывает уже
// closed. Дубли, в том числе параллельные и REST + бот, отсекает уникальный индекс -> P2002.
export async function createApplicationRecord(input: {
    vacancyId: number;
    candidateUserId: number;
    contact: string;
    candidateChatId: string | null;
    // invited — отклик по приглашению работодателя («Моя бригада»), минуя «Новый».
    status?: 'new' | 'invited';
    source?: ApplicationSource;
    // Канал партнёра, из поста которого пришёл отклик.
    partnerChannelId?: number | null;
}): Promise<CreateApplicationResult> {
    try {
        return await db.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<{ status: string; employer_user_id: number }[]>`
                SELECT status, employer_user_id FROM vacancies WHERE id = ${input.vacancyId} FOR SHARE`;
            const vacancy = rows[0];
            if (!vacancy) return { ok: false as const, error: 'not_found' as const };
            if (vacancy.employer_user_id === input.candidateUserId) {
                return { ok: false as const, error: 'self_application_forbidden' as const };
            }
            if (vacancy.status !== 'published') {
                return { ok: false as const, error: 'vacancy_unavailable' as const };
            }
            const application = await tx.application.create({
                data: {
                    vacancyId: input.vacancyId,
                    candidateUserId: input.candidateUserId,
                    status: input.status ?? 'new',
                    source: input.source ?? null,
                    partnerChannelId: input.partnerChannelId ?? null,
                    contact: input.contact,
                    candidateChatId: input.candidateChatId,
                },
            });
            await recordEvents(tx, [application.id], 'applied', application.createdAt);
            if (application.status === 'invited') {
                await recordEvents(tx, [application.id], 'status:invited', application.createdAt);
            }
            return { ok: true as const, application };
        });
    } catch (err: any) {
        if (err?.code === 'P2002') return { ok: false, error: 'already_applied' };
        throw err;
    }
}

// Шаг 1 отклика через бота: кандидат нажал «Откликнуться», просим контакт.

export async function handleApplyClick(
    candidateChatId: string,
    candidateMaxUserId: string,
    vacancyId: number,
    source: ApplicationSource = 'card',
    channelId?: number
) {
    const candidate = await db.user.findUnique({ where: { maxUserId: candidateMaxUserId } });
    if (!candidate) {
        await maxApi.sendMessage(candidateChatId, 'Не получилось оформить отклик, попробуйте ещё раз чуть позже.');
        return;
    }

    const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId } });
    if (!vacancy) {
        await maxApi.sendMessage(candidateChatId, 'Эта вакансия больше не доступна.');
        return;
    }

    if (vacancy.employerUserId === candidate.id) {
        await maxApi.sendMessage(candidateChatId, 'Это ваша вакансия — откликнуться на неё нельзя. Ссылку можно переслать кандидатам.');
        return;
    }

    if (vacancy.status !== 'published') {
        await maxApi.sendMessage(candidateChatId, 'Эта вакансия сейчас недоступна для отклика (закрыта или ещё не опубликована).');
        return;
    }

    const existing = await db.application.findFirst({
        where: { vacancyId, candidateUserId: candidate.id },
    });
    if (existing) {
        await maxApi.sendMessage(candidateChatId, 'Вы уже откликались на эту вакансию — работодатель уже получил уведомление.');
        return;
    }

    const partnerChannelId = await knownChannelId(channelId);
    await db.pendingApplication.upsert({
        where: { chatId: candidateChatId },
        update: { vacancyId, source, partnerChannelId },
        create: { chatId: candidateChatId, vacancyId, source, partnerChannelId },
    });

    // TODO: реальный вид payload при нажатии request_contact подтверждён частично (vcf_info) —
    // см. extractContactFromMessage в webhook.ts. Текстовый ответ работает в любом случае.
    await maxApi.sendMessage(
        candidateChatId,
        'Отлично! Чтобы работодатель мог с вами связаться, поделитесь контактом кнопкой ниже, ' +
            'или просто напишите телефон/юзернейм в MAX сообщением.',
        [[{ type: 'request_contact', text: 'Поделиться контактом' }]]
    );
}

// Шаг 2: пришёл контакт (текстом или через request_contact) — сохраняем отклик.

export async function resolvePendingApplication(
    chatId: string,
    candidateMaxUserId: string,
    contactRaw: string | undefined
): Promise<boolean> {
    const pending = await db.pendingApplication.findUnique({ where: { chatId } });
    if (!pending) return false;

    const text = normalizeSingleLine(contactRaw ?? '');
    const contact = hasForbiddenChars(text) ? null : normalizeContact(text);
    if (!contact) {
        await maxApi.sendMessage(
            chatId,
            `Не понял контакт — напишите ${escapeMarkdown(CONTACT_FORMAT_HINT)} или нажмите кнопку «Поделиться контактом».`
        );
        return true;
    }
    if (contact.length > APPLICATION_CONTACT_MAX_LENGTH) {
        await maxApi.sendMessage(chatId, `Контакт слишком длинный — уложитесь в ${APPLICATION_CONTACT_MAX_LENGTH} символов: телефон или юзернейм в MAX.`);
        return true;
    }

    const candidate = await db.user.findUnique({ where: { maxUserId: candidateMaxUserId } });
    if (!candidate) {
        await maxApi.sendMessage(chatId, 'Не получилось оформить отклик, попробуйте ещё раз через кнопку «Откликнуться».');
        return true;
    }

    const vacancy = await db.vacancy.findUnique({
        where: { id: pending.vacancyId },
        include: { employer: true },
    });
    if (!vacancy) {
        await db.pendingApplication.delete({ where: { chatId } }).catch(() => {});
        await maxApi.sendMessage(chatId, 'Эта вакансия больше не доступна.');
        return true;
    }

    // Вакансию могли закрыть после нажатия «Откликнуться», а кандидат — откликнуться из мини-приложения.
    // pending удаляем только при успехе или окончательном отказе: при сбое БД кандидат может повторить.
    let application;
    try {
        const result = await createApplicationRecord({
            vacancyId: vacancy.id,
            candidateUserId: candidate.id,
            contact,
            candidateChatId: chatId,
            source: (pending.source as ApplicationSource | null) ?? undefined,
            partnerChannelId: pending.partnerChannelId,
        });
        if (!result.ok) {
            await db.pendingApplication.delete({ where: { chatId } }).catch(() => {});
            const messages: Record<CreateApplicationError, string> = {
                not_found: 'Эта вакансия больше не доступна.',
                vacancy_unavailable: 'Эта вакансия уже недоступна для отклика (закрыта или снята с публикации).',
                self_application_forbidden: 'Это ваша вакансия — откликнуться на неё нельзя.',
                already_applied: 'Вы уже откликались на эту вакансию.',
            };
            await maxApi.sendMessage(chatId, messages[result.error]);
            return true;
        }
        application = result.application;
    } catch (err) {
        console.error('failed to create application', err);
        await maxApi.sendMessage(chatId, 'Не получилось сохранить отклик, попробуйте отправить контакт ещё раз через минуту.');
        return true;
    }

    await db.pendingApplication.delete({ where: { chatId } }).catch(() => {});

    // Отдельные try/catch: сбой одного сообщения не должен мешать второму.
    try {
        await maxApi.sendMessage(
            chatId,
            `Отклик отправлен! Работодатель получит ваш контакт и свяжется по вакансии «${escapeMarkdown(vacancy.title)}».`,
            [[{ type: 'callback', text: 'Присылать похожие вакансии', payload: `subscribe_like:${vacancy.id}` }]]
        );
    } catch (err) {
        console.error('failed to send confirmation to candidate', vacancy.id, err);
    }

    const employerChatId = vacancy.employerChatId || vacancy.employer.chatId;
    try {
        await maxApi.sendMessage(
            employerChatId,
            `Новый отклик на вакансию «${escapeMarkdown(vacancy.title)}»:\n` +
                `Кандидат: ${escapeMarkdown(candidate.displayName ?? 'без имени в MAX')}\n` +
                `Контакт: ${escapeMarkdown(contact)}`,
            funnelButtons(application.id)
        );
    } catch (err) {
        console.error('failed to notify employer about new application (chat flow)', vacancy.id, err);
    }

    return true;
}


export async function handleStatusChangeFromChat(
    employerChatId: string,
    senderMaxUserId: string,
    applicationId: number,
    status: string
) {
    if (!VALID_STATUSES.includes(status)) return;

    const application = await db.application.findUnique({
        where: { id: applicationId },
        include: { vacancy: { include: { employer: true } } },
    });
    if (!application) return;

    // Сверяем и чат, и user_id нажавшего: в группе chatId у всех участников одинаковый.
    const ownerChatId = application.vacancy.employerChatId || application.vacancy.employer.chatId;
    if (ownerChatId !== employerChatId) return;
    if (application.vacancy.employer.maxUserId !== senderMaxUserId) return;

    const result = await applyStatusChange(applicationId, status);
    const suffix = result.unchanged
        ? ' (статус не изменился)'
        : result.notified
          ? ''
          : ' (не удалось уведомить кандидата — сообщите ему лично)';
    await maxApi.sendMessage(employerChatId, `Статус обновлён: ${statusLabel(status)}.${suffix}`);
}

export interface ApplyStatusChangeResult {
    application: Application & { vacancy: Vacancy; candidate: User };
    notified: boolean;
    notifyError?: string;
    // Статус уже был таким — ни записи, ни повторного уведомления.
    unchanged?: boolean;
    // Этот найм заполнил все места (headcount) — вакансия закрыта автоматически.
    vacancyClosed?: boolean;
}

// Общая точка для REST и кнопок в чате. Сбой доставки в MAX не откатывает статус — только notified: false.
export async function applyStatusChange(applicationId: number, status: string): Promise<ApplyStatusChangeResult> {
    // Условный UPDATE: при двух одновременных одинаковых сменах уведомление уйдёт один раз.
    const changed = await db.application.updateMany({
        where: { id: applicationId, status: { not: status } },
        data: { status, ...(status === 'hired' ? { hiredAt: new Date() } : {}) },
    });
    const application = await db.application.findUniqueOrThrow({
        where: { id: applicationId },
        include: { vacancy: true, candidate: true },
    });
    if (changed.count === 0) {
        return { application, notified: false, unchanged: true };
    }
    // Смена этапа означает, что работодатель отклик видел (в том числе кнопкой в чате).
    await recordEvents(db, [applicationId], `status:${status}` as EventType);
    await markViewed([applicationId]);

    const notification = await notifyCandidate(application, status);
    const vacancyClosed = status === 'hired' ? await closeIfFilled(application.vacancyId) : false;
    return { application, ...notification, vacancyClosed };
}

async function notifyCandidate(
    application: Application & { vacancy: Vacancy; candidate: User },
    status: string
): Promise<{ notified: boolean; notifyError?: string }> {
    const candidateText = statusMessageForCandidate(status, application.vacancy.title, application.vacancy.contactInfo);
    // Фолбэк — только личный чат: последний chatId мог быть групповым.
    const targetChatId = application.candidateChatId || application.candidate.dialogChatId;
    if (!candidateText || !targetChatId) return { notified: false };

    try {
        await maxApi.sendMessage(targetChatId, candidateText);
        return { notified: true };
    } catch (err: any) {
        console.error('failed to notify candidate about status change', application.id, err);
        return { notified: false, notifyError: err?.message ?? String(err) };
    }
}

// Все места заняты — закрываем вакансию и вежливо отвечаем тем, кто ещё ждёт (Новый, На связи).
// «Приглашённых» не трогаем: работодатель уже договаривался с ними сам. При одновременных наймах
// закрытие и рассылка происходят один раз — у остальных updateMany вернёт count === 0.
async function closeIfFilled(vacancyId: number): Promise<boolean> {
    const vacancy = await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId }, include: { employer: true } });
    if (!vacancy.headcount || vacancy.status !== 'published') return false;
    const hired = await db.application.count({ where: { vacancyId, status: 'hired' } });
    if (hired < vacancy.headcount) return false;

    const closed = await db.vacancy.updateMany({
        where: { id: vacancyId, status: 'published' },
        data: { status: 'closed', closedAt: new Date() },
    });
    if (closed.count === 0) return false;

    const waiting = await db.application.findMany({
        where: { vacancyId, status: { in: ['new', 'contacted'] } },
        include: { candidate: true },
    });
    await db.application.updateMany({
        where: { id: { in: waiting.map((a) => a.id) }, status: { in: ['new', 'contacted'] } },
        data: { status: 'rejected' },
    });
    await recordEvents(db, waiting.map((a) => a.id), 'status:rejected');
    const title = escapeMarkdown(vacancy.title);
    for (const a of waiting) {
        const chatId = a.candidateChatId || a.candidate.dialogChatId;
        if (!chatId) continue;
        await maxApi
            .sendMessage(chatId, `Спасибо за отклик на «${title}»! Набор уже закрыт — все места заняты. Удачи в поиске работы!`)
            .catch((err) => console.error('failed to send filled-vacancy notice', a.id, err));
    }

    const employerChatId = vacancy.employerChatId || vacancy.employer.dialogChatId || vacancy.employer.chatId;
    if (employerChatId) {
        const rest = waiting.length ? ` Остальным ${waiting.length} кандидатам отправлен вежливый отказ.` : '';
        await maxApi
            .sendMessage(employerChatId, `Набор на «${title}» закрыт: все ${vacancy.headcount} мест заняты.${rest}`)
            .catch((err) => console.error('failed to notify employer about filled vacancy', vacancyId, err));
    }
    return true;
}
