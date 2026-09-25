import { db } from '../db.js';
import { maxApi } from '../max/client.js';

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
    if (status === 'invited') {
        return `Хорошие новости! Вас пригласили на вакансию «${vacancyTitle}». Работодатель свяжется с вами.`;
    }
    if (status === 'hired') {
        return `Поздравляем! Вас приняли на вакансию «${vacancyTitle}».`;
    }
    if (status === 'rejected') {
        return `По вакансии «${vacancyTitle}», к сожалению, вам отказали.`;
    }
    // Минимум по ТЗ (раздел 2, шаг 8) — уведомление обязательно только при invited/rejected/hired.
    // "contacted" и возврат в "new" — молча, не спамим лишний раз.
    return undefined;
}

function funnelButtons(applicationId: number) {
    return [
        [
            { type: 'callback' as const, text: 'На связи', payload: `app_status:${applicationId}:contacted` },
            { type: 'callback' as const, text: 'Пригласить', payload: `app_status:${applicationId}:invited` },
        ],
        [
            { type: 'callback' as const, text: 'Нанять', payload: `app_status:${applicationId}:hired` },
            { type: 'callback' as const, text: 'Отказать', payload: `app_status:${applicationId}:rejected` },
        ],
    ];
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

    // TODO: реальный вид payload при нажатии request_contact не подтверждён живым тестом —
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

    await db.pendingApplication.delete({ where: { chatId } });

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
        await maxApi.sendMessage(chatId, 'Эта вакансия больше не доступна.');
        return true;
    }

    let application;
    try {
        application = await db.application.create({
            data: {
                vacancyId: vacancy.id,
                candidateUserId: candidate.id,
                status: 'new',
                contact,
            },
        });
    } catch (err: any) {
        if (err?.code === 'P2002') {
            await maxApi.sendMessage(chatId, 'Вы уже откликались на эту вакансию.');
            return true;
        }
        throw err;
    }

    await maxApi.sendMessage(
        chatId,
        `Отклик отправлен! Работодатель получит ваш контакт и свяжется по вакансии «${vacancy.title}».`
    );

    await maxApi.sendMessage(
        vacancy.employer.chatId,
        `Новый отклик на вакансию «${vacancy.title}»:\nКандидат: ${candidate.displayName ?? 'без имени в MAX'}\nКонтакт: ${contact}`,
        funnelButtons(application.id)
    );

    return true;
}

// --- Воронка: смена статуса кнопкой из чата работодателя ---

export async function handleStatusChangeFromChat(employerChatId: string, applicationId: number, status: string) {
    if (!VALID_STATUSES.includes(status)) return;

    const application = await db.application.findUnique({
        where: { id: applicationId },
        include: { vacancy: { include: { employer: true } } },
    });
    if (!application) return;

    // Менять статус может только работодатель этой конкретной вакансии
    if (application.vacancy.employer.chatId !== employerChatId) return;

    await applyStatusChange(applicationId, status);
    await maxApi.sendMessage(employerChatId, `Статус обновлён: ${statusLabel(status)}.`);
}

// --- Воронка: смена статуса из собственного REST API (раздел 6 ТЗ) ---
// Общая точка для чата и API, чтобы кандидат получал уведомление в обоих случаях.

export async function applyStatusChange(applicationId: number, status: string) {
    const application = await db.application.update({
        where: { id: applicationId },
        data: { status },
        include: { vacancy: true, candidate: true },
    });

    const candidateText = statusMessageForCandidate(status, application.vacancy.title);
    if (candidateText) {
        await maxApi.sendMessage(application.candidate.chatId, candidateText);
    }

    return application;
}
