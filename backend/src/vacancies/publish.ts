import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { buildVacancyCardText, buildApplyDeepLink, MAX_CARD_TEXT_LIMIT } from './cardText.js';
import type { Vacancy } from '@prisma/client';
import { onVacancyPublished } from './broadcast.js';

export type PublishErrorKind = 'not_found' | 'conflict' | 'no_chat';

export class PublishError extends Error {
    kind: PublishErrorKind;
    constructor(kind: PublishErrorKind, message: string) {
        super(message);
        this.kind = kind;
    }
}

// Только при таймауте неизвестно, дошло ли сообщение до MAX. Любая другая ошибка — подтверждённый
// отказ, откат в draft безопасен.
function isAmbiguousDeliveryError(err: unknown): boolean {
    return err instanceof Error && err.name === 'TimeoutError';
}

// Через сколько чужая попытка доставки считается зависшей (процесс упал между claim и снятием метки).
const STALE_DELIVERY_ATTEMPT_MS = 30_000;

export async function publishVacancyCard(vacancy: Vacancy): Promise<void> {
    // null — username бота неизвестен: карточка уходит без deep link, только с callback-кнопкой.
    const applyUrl = buildApplyDeepLink(vacancy.id);
    if (!applyUrl) {
        console.warn(`vacancy ${vacancy.id}: bot username unknown (set MAX_BOT_USERNAME), card is sent without the apply link`);
    }
    const text = buildVacancyCardText({
        title: vacancy.title,
        regionCode: vacancy.regionCode,
        schedule: vacancy.schedule,
        salaryMin: vacancy.salaryMin,
        salaryMax: vacancy.salaryMax,
        description: vacancy.description,
        contactInfo: vacancy.contactInfo,
        headcount: vacancy.headcount,
        studentFriendly: vacancy.studentFriendly,
    }, applyUrl);
    // Старые записи могли сохраниться до резерва под ссылку — проверяем итоговый текст ещё раз.
    if (text.length > MAX_CARD_TEXT_LIMIT) {
        throw new PublishError(
            'conflict',
            `vacancy ${vacancy.id}: card text is ${text.length} characters, exceeds MAX limit of ${MAX_CARD_TEXT_LIMIT}`
        );
    }

    const employer = await db.user.findUnique({ where: { id: vacancy.employerUserId } });
    // Застывший чат вакансии приоритетнее: users.chatId может смениться на групповой.
    const targetChatId = vacancy.employerChatId || employer?.dialogChatId || employer?.chatId;
    if (!targetChatId) {
        throw new PublishError('no_chat', `cannot publish vacancy ${vacancy.id}: employer has no known chat with the bot yet`);
    }

    const buttons: InlineButton[][] = [
        [{ type: 'callback', text: 'Откликнуться', payload: `apply:${vacancy.id}` }],
    ];

    // Deep link работает и из чата без бота: MAX откроет личный чат и пришлёт bot_started.
    if (applyUrl) {
        buttons.push([{ type: 'link', text: 'Откликнуться из другого чата', url: applyUrl }]);
    }

    const result = await maxApi.sendMessage(targetChatId, text, buttons);

    const cardMessageId = result?.message?.body?.mid; // TODO: сверить поле с реальным ответом MAX API
    await db.vacancy.update({
        where: { id: vacancy.id },
        data: {
            ...(cardMessageId ? { cardMessageId } : {}),
            ...(vacancy.employerChatId ? {} : { employerChatId: targetChatId }),
        },
    });
}

// Атомарно забирает право повторно доставить карточку published-вакансии без cardMessageId:
// второй параллельный updateMany с тем же WHERE получит count === 0, поэтому дубля карточки не будет.
async function claimCardRedelivery(vacancyId: number): Promise<Vacancy | null> {
    const staleThreshold = new Date(Date.now() - STALE_DELIVERY_ATTEMPT_MS);
    const claim = await db.vacancy.updateMany({
        where: {
            id: vacancyId,
            status: 'published',
            cardMessageId: null,
            OR: [{ publishDeliveryAttemptAt: null }, { publishDeliveryAttemptAt: { lt: staleThreshold } }],
        },
        data: { publishDeliveryAttemptAt: new Date() },
    });
    if (claim.count === 0) return null;
    return db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
}

// При подтверждённом отказе метку снимаем сразу. При таймауте — нет: неизвестно, ушла ли карточка,
// и лишняя попытка внутри окна рискованнее паузы перед retry.
async function attemptCardRedelivery(claimed: Vacancy): Promise<void> {
    try {
        await publishVacancyCard(claimed);
    } catch (err) {
        if (!isAmbiguousDeliveryError(err)) {
            await db.vacancy
                .updateMany({
                    where: { id: claimed.id, cardMessageId: null },
                    data: { publishDeliveryAttemptAt: null },
                })
                .catch(() => {});
        }
        throw err;
    }
}

async function redeliverOrReportConflict(vacancyId: number): Promise<Vacancy> {
    const claimed = await claimCardRedelivery(vacancyId);
    if (!claimed) {
        // Карточку только что подтвердил параллельный запрос — или он ещё доставляет её.
        const current = await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
        if (current.cardMessageId) return current;
        throw new PublishError('conflict', 'card delivery is already being retried, try again shortly');
    }
    await attemptCardRedelivery(claimed);
    return db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
}

// Единая точка публикации для REST и диалога бота.
export async function publishVacancy(vacancyId: number): Promise<Vacancy> {
    const vacancy = await publishVacancyOnce(vacancyId);
    void onVacancyPublished(vacancy.id);
    return vacancy;
}

async function publishVacancyOnce(vacancyId: number): Promise<Vacancy> {
    const existing = await db.vacancy.findUnique({ where: { id: vacancyId } });
    if (!existing) {
        throw new PublishError('not_found', 'vacancy not found');
    }
    if (existing.status === 'closed') {
        throw new PublishError('conflict', 'vacancy is closed, cannot publish');
    }

    if (existing.status === 'published') {
        // Без cardMessageId (например, после таймаута) это незавершённая публикация — доставляем повторно.
        if (existing.cardMessageId) {
            throw new PublishError('conflict', 'vacancy already published');
        }
        return redeliverOrReportConflict(vacancyId);
    }

    // Атомарный переход: при двойном клике карточку отправит только один запрос.
    const claim = await db.vacancy.updateMany({
        where: { id: vacancyId, status: 'draft' },
        data: { status: 'published', publishedAt: new Date() },
    });
    if (claim.count === 0) {
        // Переход забрал параллельный запрос; если карточка не подтвердилась — та же ветка повторной доставки.
        const current = await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
        if (current.status === 'published' && !current.cardMessageId) {
            return redeliverOrReportConflict(vacancyId);
        }
        throw new PublishError('conflict', 'vacancy already published or not in draft state');
    }

    const vacancy = await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });

    try {
        await publishVacancyCard(vacancy);
    } catch (err) {
        if (isAmbiguousDeliveryError(err)) {
            // Не откатываем: если карточка всё же ушла, повторная публикация из draft дала бы дубль.
            throw err;
        }
        // Откатываем, только если вакансию тем временем не закрыли.
        await db.vacancy.updateMany({
            where: { id: vacancyId, status: 'published' },
            data: { status: 'draft', publishedAt: null },
        }).catch(() => {});
        throw err;
    }

    return db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
}
