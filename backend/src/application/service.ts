import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { escapeMarkdown } from '../markdown.js';
import { APPLICATION_CONTACT_MAX_LENGTH } from '../validation.js';
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

function statusMessageForCandidate(status: string, vacancyTitle: string): string | undefined {
    const title = escapeMarkdown(vacancyTitle);
    if (status === 'invited') {
        return `Хорошие новости! Вас пригласили на вакансию «${title}». Работодатель свяжется с вами.`;
    }
    if (status === 'hired') {
        return `Поздравляем! Вас приняли на вакансию «${title}».`;
    }
    if (status === 'rejected') {
        return `По вакансии «${title}», к сожалению, вам отказали.`;
    }
    // Минимум по ТЗ (раздел 2, шаг 8) — уведомление обязательно только при invited/rejected/hired.
    // "contacted" и возврат в "new" — молча, не спамим лишний раз.
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

// --- Создание отклика: общая точка для REST (POST /api/applications) и бота ---

export type CreateApplicationError = 'not_found' | 'vacancy_unavailable' | 'self_application_forbidden' | 'already_applied';

export type CreateApplicationResult =
    | { ok: true; application: Application }
    | { ok: false; error: CreateApplicationError };

// Единые правила для обоих каналов: вакансия существует и published, отклик не на свою вакансию,
// одна запись на пару (vacancy, candidate). Проверка статуса и вставка — в одной транзакции под
// SELECT ... FOR SHARE на строку вакансии: закрытие (UPDATE status='closed' в /close) ждёт этой
// блокировки, а отклик, начавшийся после закрытия, после ожидания перечитывает уже closed — значит,
// отклик на вакансию, закрытие которой зафиксировалось раньше, не сохранится. Дубли (в т.ч.
// параллельные и REST+бот) отсекает уникальный индекс (vacancy_id, candidate_user_id) -> P2002.
export async function createApplicationRecord(input: {
    vacancyId: number;
    candidateUserId: number;
    contact: string;
    candidateChatId: string | null;
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
                    status: 'new',
                    contact: input.contact,
                    candidateChatId: input.candidateChatId,
                },
            });
            return { ok: true as const, application };
        });
    } catch (err: any) {
        // Уникальный constraint (vacancy_id, candidate_user_id) — см. миграцию add_application_unique
        if (err?.code === 'P2002') return { ok: false, error: 'already_applied' };
        throw err;
    }
}

// --- Отклик: шаг 1 — кандидат жмёт «Откликнуться», просим контакт ---

export async function handleApplyClick(candidateChatId: string, candidateMaxUserId: string, vacancyId: number) {
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

    // Те же правила, что и в REST (createApplicationRecord): на собственную вакансию не откликаются.
    if (vacancy.employerUserId === candidate.id) {
        await maxApi.sendMessage(candidateChatId, 'Это ваша вакансия — откликнуться на неё нельзя. Ссылку можно переслать кандидатам.');
        return;
    }

    // Нельзя откликаться на черновик или закрытую вакансию — карточка могла быть переслана уже
    // после того, как работодатель закрыл вакансию, либо это вообще ещё не опубликованный черновик.
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

    await db.pendingApplication.upsert({
        where: { chatId: candidateChatId },
        update: { vacancyId },
        create: { chatId: candidateChatId, vacancyId },
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

// --- Отклик: шаг 2 — пришёл контакт (текстом или через request_contact), фиксируем отклик ---

export async function resolvePendingApplication(
    chatId: string,
    candidateMaxUserId: string,
    contactRaw: string | undefined
): Promise<boolean> {
    const pending = await db.pendingApplication.findUnique({ where: { chatId } });
    if (!pending) return false;

    const contact = (contactRaw ?? '').trim();
    if (!contact) {
        await maxApi.sendMessage(
            chatId,
            'Не понял контакт — напишите телефон/юзернейм текстом или нажмите кнопку «Поделиться контактом».'
        );
        return true; // сообщение адресовано этому флоу, просто переспрашиваем, сессию не рвём
    }
    // Тот же лимит, что и у REST (createApplicationSchema.contact) — одинаковые правила для каналов.
    if (contact.length > APPLICATION_CONTACT_MAX_LENGTH) {
        await maxApi.sendMessage(chatId, `Контакт слишком длинный — уложитесь в ${APPLICATION_CONTACT_MAX_LENGTH} символов: телефон или юзернейм в MAX.`);
        return true;
    }

    const candidate = await db.user.findUnique({ where: { maxUserId: candidateMaxUserId } });
    if (!candidate) {
        // Не трогаем pendingApplication — пользователь всё ещё может донастроить свою учётку и повторить.
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

    // Проверки статуса, самоотклика и дубля — в общей транзакции с REST (createApplicationRecord):
    // вакансию могли закрыть между нажатием «Откликнуться» и отправкой контакта (раздел 2.1
    // хендоффа), а кандидат мог параллельно откликнуться из мини-приложения.
    // Важен порядок: pendingApplication чистим только при успехе или окончательном отказе —
    // если create падал по любой другой причине, кандидат не должен молча терять состояние "жду контакт".
    let application;
    try {
        const result = await createApplicationRecord({
            vacancyId: vacancy.id,
            candidateUserId: candidate.id,
            contact,
            // Чат, где реально прошёл отклик — гарантированно верный адрес для уведомлений кандидату.
            candidateChatId: chatId,
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

    // Оба сообщения ниже изолированы своими try/catch — раньше падение первого (кандидату) не
    // давало даже попытаться отправить второе (работодателю), хотя отклик уже сохранён в любом случае.
    try {
        await maxApi.sendMessage(
            chatId,
            `Отклик отправлен! Работодатель получит ваш контакт и свяжется по вакансии «${escapeMarkdown(vacancy.title)}».`
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
        // Отклик уже сохранён — сбой уведомления работодателя не должен выглядеть как сбой всего флоу.
        console.error('failed to notify employer about new application (chat flow)', vacancy.id, err);
    }

    return true;
}

// --- Воронка: смена статуса кнопкой из чата работодателя ---

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

    // Менять статус может только сам работодатель этой вакансии. Раньше сверялся только chatId —
    // в групповом чате, где стоит бот, любой участник группы прошёл бы эту проверку, потому что
    // chatId у всех сообщений из группы одинаковый. Теперь дополнительно сверяем MAX user_id
    // нажавшего с владельцем вакансии (раздел 1.5 хендоффа).
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
    // true, если статус уже был именно таким и мы не стали ни менять запись, ни слать уведомление
    // повторно (раздел 2.3 хендоффа — повтор того же статуса раньше повторно слал сообщение).
    unchanged?: boolean;
}

// --- Воронка: смена статуса из собственного REST API (раздел 6 ТЗ) ---
// Общая точка для чата и API, чтобы кандидат получал уведомление в обоих случаях.
// Мутация статуса и уведомление кандидата — два разных результата: если сообщение в MAX не
// доставилось (сеть, чат недоступен), это не должно откатывать уже сохранённый статус или
// превращать успешный запрос в 500 — вызывающий код сам решает, как сообщить про notified:false.
export async function applyStatusChange(applicationId: number, status: string): Promise<ApplyStatusChangeResult> {
    // Условный UPDATE вместо «прочитать, сравнить, записать»: при двух одновременных одинаковых
    // сменах статуса (REST + кнопка в чате) запись и уведомление случатся только один раз.
    const changed = await db.application.updateMany({
        where: { id: applicationId, status: { not: status } },
        data: { status },
    });
    const application = await db.application.findUniqueOrThrow({
        where: { id: applicationId },
        include: { vacancy: true, candidate: true },
    });
    if (changed.count === 0) {
        return { application, notified: false, unchanged: true };
    }

    const candidateText = statusMessageForCandidate(status, application.vacancy.title);
    // Фолбэк — только подтверждённый личный чат с ботом (dialogChatId из bot_started), а не
    // "последний увиденный" chatId, который может оказаться групповым: сообщение о найме/отказе
    // не должно уйти в группу. Нет ни того, ни другого — notified:false, статус всё равно сохранён.
    const targetChatId = application.candidateChatId || application.candidate.dialogChatId;

    if (!candidateText || !targetChatId) {
        return { application, notified: false };
    }

    try {
        await maxApi.sendMessage(targetChatId, candidateText);
        return { application, notified: true };
    } catch (err: any) {
        console.error('failed to notify candidate about status change', applicationId, err);
        return { application, notified: false, notifyError: err?.message ?? String(err) };
    }
}
