import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { getBotUsername } from '../max/botInfo.js';
import { buildVacancyCardText } from './cardText.js';
import type { Vacancy } from '@prisma/client';

export type PublishErrorKind = 'not_found' | 'conflict' | 'no_chat';

export class PublishError extends Error {
    kind: PublishErrorKind;
    constructor(kind: PublishErrorKind, message: string) {
        super(message);
        this.kind = kind;
    }
}

// Таймаут (см. max/client.ts, AbortSignal.timeout) — единственный случай, когда мы НЕ знаем,
// дошло ли сообщение до MAX: запрос мог как не уйти вовсе, так и уйти и просто не успеть
// вернуть ответ. Любая другая ошибка (4xx/5xx с ответом, сетевой отказ до отправки) — это
// подтверждённый отказ, для него откат в draft безопасен и не рискует задвоить карточку.
function isAmbiguousDeliveryError(err: unknown): boolean {
    return err instanceof Error && err.name === 'TimeoutError';
}

// Сколько ждать, прежде чем считать чужую попытку доставки карточки "зависшей" (процесс упал
// между claim и снятием метки) и разрешить новый retry поверх неё. Не бесконечно, иначе один
// упавший процесс навсегда блокирует повторную публикацию вручную через БД.
const STALE_DELIVERY_ATTEMPT_MS = 30_000;

export async function publishVacancyCard(vacancy: Vacancy): Promise<void> {
    const text = buildVacancyCardText({
        title: vacancy.title,
        regionCode: vacancy.regionCode,
        schedule: vacancy.schedule,
        salaryMin: vacancy.salaryMin,
        salaryMax: vacancy.salaryMax,
        description: vacancy.description,
        contactInfo: vacancy.contactInfo,
    });

    const employer = await db.user.findUnique({ where: { id: vacancy.employerUserId } });
    // Целевой чат для карточки — застывший employerChatId вакансии, а не "текущий" chatId
    // работодателя из users (который может перезаписаться, если работодатель напишет боту
    // из группового чата уже после публикации). Фолбэк на текущий chatId — только для вакансий,
    // созданных до появления этого поля, либо через REST без явного chatId. Пустая строка
    // (плейсхолдер users.chatId для ещё не писавших боту пользователей мини-аппа) — тоже "нет чата".
    const targetChatId = vacancy.employerChatId || employer?.chatId;
    if (!targetChatId) {
        // Типизированная ошибка (не просто Error) — server.ts отдаёт под неё отдельный код
        // employer_chat_missing вместо общего upstream_error, чтобы frontend мог явно предложить
        // работодателю сначала открыть личный чат с ботом (раздел 6 фидбека фронтенда).
        throw new PublishError('no_chat', `cannot publish vacancy ${vacancy.id}: employer has no known chat with the bot yet`);
    }

    const buttons: InlineButton[][] = [
        [{ type: 'callback', text: 'Откликнуться', payload: `apply:${vacancy.id}` }],
    ];

    // Deep-link кнопка — работает, даже если карточку переслали в чат/группу, где бота нет:
    // MAX откроет приватный чат с ботом и пришлёт update_type=bot_started с payload=apply_<id>
    // (см. webhook.ts). Доступна только когда известен username бота (кэшируется при старте, см. server.ts).
    const botUsername = getBotUsername();
    if (botUsername) {
        buttons.push([
            { type: 'link', text: 'Откликнуться из другого чата', url: `https://max.ru/${botUsername}?start=apply_${vacancy.id}` },
        ]);
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

// Атомарно "забирает" право попытаться (пере)доставить карточку для уже published вакансии без
// cardMessageId. Раньше обе ветки ниже (existing.status === 'published' и claim.count === 0)
// звали publishVacancyCard() напрямую без какой-либо блокировки — при двух параллельных вызовах
// publish на одну и ту же зависшую (без cardMessageId) вакансию оба проходили одну и ту же проверку
// "cardMessageId пуст" и оба слали карточку в MAX, вопреки описанной в OpenAPI гарантии "повторный
// вызов безопасен, дубликата не будет" (фидбек ревьюера и фронтенда). Тот же паттерн, что и для
// draft -> published: claim через updateMany с условием на текущее значение поля-метки — второй
// параллельный updateMany с тем же WHERE после коммита первого больше не находит строку и получает
// count === 0, СУБД сериализует конкурентные UPDATE на одну строку через row-level lock.
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

// Пытается (пере)доставить уже claim'нутую карточку и снимает метку попытки при подтверждённом
// отказе, чтобы следующий retry не ждал STALE_DELIVERY_ATTEMPT_MS впустую. При таймауте метку
// намеренно НЕ снимаем — мы не знаем, ушла ли карточка, и лишняя параллельная попытка внутри
// STALE-окна рискованнее, чем короткая пауза перед следующим retry (см. isAmbiguousDeliveryError).
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

// Общая точка для веток "вакансия уже published, но карточка не подтвердилась" — используется
// и явным existing.status === 'published' случаем, и фолбэком после проигранной гонки за
// draft -> published ниже, чтобы обе ветки шли через один и тот же claim и не дублировали логику.
async function redeliverOrReportConflict(vacancyId: number): Promise<Vacancy> {
    const claimed = await claimCardRedelivery(vacancyId);
    if (!claimed) {
        // Либо карточка только что подтвердилась в параллельном запросе (перечитываем и просто
        // возвращаем актуальную вакансию), либо другой запрос прямо сейчас пытается её доставить —
        // не шлём вторую карточку вдогонку, а просим клиента повторить попытку чуть позже.
        const current = await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
        if (current.cardMessageId) return current;
        throw new PublishError('conflict', 'card delivery is already being retried, try again shortly');
    }
    await attemptCardRedelivery(claimed);
    return db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
}

// Единая точка перевода вакансии в published — используется и REST-эндпоинтом (server.ts),
// и диалогом создания вакансии в чате (vacancyFlow.ts), чтобы избежать дублирующих карточек
// и рассинхрона "статус published в БД, но карточка в MAX не ушла" при сбое отправки.
export async function publishVacancy(vacancyId: number): Promise<Vacancy> {
    const existing = await db.vacancy.findUnique({ where: { id: vacancyId } });
    if (!existing) {
        throw new PublishError('not_found', 'vacancy not found');
    }
    if (existing.status === 'closed') {
        throw new PublishError('conflict', 'vacancy is closed, cannot publish');
    }

    if (existing.status === 'published') {
        // Уже published — но если карточка так и не подтвердилась (cardMessageId пуст, например
        // прошлая попытка упала по таймауту), это не настоящий конфликт: это незавершённая
        // публикация. Пробуем (пере)доставить карточку на ТУ ЖЕ вакансию вместо 409, иначе
        // повторный вызов после таймаута навсегда оставлял бы вакансию без карточки без способа
        // это исправить, кроме ручного вмешательства в БД.
        if (existing.cardMessageId) {
            throw new PublishError('conflict', 'vacancy already published');
        }
        return redeliverOrReportConflict(vacancyId);
    }

    // Атомарный переход draft -> published: при параллельных запросах (двойной клик в мини-аппе,
    // повторная отправка формы) claim'ит только один запрос, остальные получат count === 0
    // и не станут слать вторую карточку в MAX на одну и ту же вакансию.
    const claim = await db.vacancy.updateMany({
        where: { id: vacancyId, status: 'draft' },
        data: { status: 'published' },
    });
    if (claim.count === 0) {
        // Между нашим findUnique выше и этим updateMany кто-то другой мог уже забрать переход —
        // перечитываем актуальное состояние вместо того, чтобы слепо считать это конфликтом: если
        // это та же самая незавершённая публикация (published без cardMessageId), обрабатываем её
        // так же, как явную ветку выше (через тот же claim на редоставку), а не заставляем клиента
        // гадать, что делать с 409.
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
            // Неизвестно, дошло сообщение до MAX или нет (таймаут ответа) — НЕ откатываем в draft.
            // Если сообщение всё же ушло, откат в draft + повторный publish отправили бы вторую
            // карточку на ту же вакансию. Вакансия остаётся published без cardMessageId — следующий
            // вызов publish попадёт в ветку выше и безопасно (через claim) повторит отправку.
            throw err;
        }
        // Подтверждённый отказ (не таймаут, например MAX ответил ошибкой) — откатываем, но ТОЛЬКО
        // если вакансию тем временем не закрыли параллельно: раньше update был безусловным и мог
        // тихо вернуть в draft вакансию, которую работодатель уже успел закрыть другим запросом.
        await db.vacancy.updateMany({
            where: { id: vacancyId, status: 'published' },
            data: { status: 'draft' },
        }).catch(() => {});
        throw err;
    }

    return db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
}
