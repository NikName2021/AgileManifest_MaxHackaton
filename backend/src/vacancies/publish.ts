import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { getBotUsername } from '../max/botInfo.js';
import { buildVacancyCardText } from './cardText.js';
import type { Vacancy } from '@prisma/client';

export class PublishError extends Error {
    kind: 'not_found' | 'conflict' | 'no_chat';
    constructor(kind: 'not_found' | 'conflict' | 'no_chat', message: string) {
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
        // публикация. Повторно пробуем отправить карточку на ТУ ЖЕ вакансию вместо 409, иначе
        // повторный вызов после таймаута навсегда оставлял бы вакансию без карточки без способа
        // это исправить, кроме ручного вмешательства в БД.
        if (existing.cardMessageId) {
            throw new PublishError('conflict', 'vacancy already published');
        }
        await publishVacancyCard(existing);
        return db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
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
        // так же, как явную ветку выше, а не заставляем клиента гадать, что делать с 409.
        const current = await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
        if (current.status === 'published' && !current.cardMessageId) {
            await publishVacancyCard(current);
            return db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
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
            // вызов publish попадёт в ветку выше и просто (безопасно) повторит отправку.
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
