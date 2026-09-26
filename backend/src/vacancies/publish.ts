import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { getBotUsername } from '../max/botInfo.js';
import { escapeMarkdown } from '../markdown.js';
import type { Vacancy } from '@prisma/client';

export class PublishError extends Error {
    kind: 'not_found' | 'conflict';
    constructor(kind: 'not_found' | 'conflict', message: string) {
        super(message);
        this.kind = kind;
    }
}

export async function publishVacancyCard(vacancy: Vacancy): Promise<void> {
    // Раньше при заполненном только одном конце вилки (например min без max) условие
    // "salaryMin && salaryMax" было ложным целиком, и карточка показывала "по договорённости",
    // хотя работодатель прямо указал число (раздел 2.5 хендоффа — "односторонняя вилка теряется").
    const salaryText = vacancy.salaryMin && vacancy.salaryMax
        ? `${vacancy.salaryMin}–${vacancy.salaryMax} ₽`
        : vacancy.salaryMin
          ? `от ${vacancy.salaryMin} ₽`
          : vacancy.salaryMax
            ? `до ${vacancy.salaryMax} ₽`
            : 'по договорённости';

    const text = [
        `**${escapeMarkdown(vacancy.title)}**`,
        `Регион: ${escapeMarkdown(vacancy.regionCode)}`,
        `График: ${escapeMarkdown(vacancy.schedule)}`,
        `Зарплата: ${salaryText}`,
        vacancy.description ? escapeMarkdown(vacancy.description) : undefined,
        vacancy.contactInfo ? `Контакт: ${escapeMarkdown(vacancy.contactInfo)}` : undefined,
    ].filter(Boolean).join('\n');

    const employer = await db.user.findUnique({ where: { id: vacancy.employerUserId } });
    // Целевой чат для карточки — застывший employerChatId вакансии, а не "текущий" chatId
    // работодателя из users (который может перезаписаться, если работодатель напишет боту
    // из группового чата уже после публикации). Фолбэк на текущий chatId — только для вакансий,
    // созданных до появления этого поля, либо через REST без явного chatId. Пустая строка
    // (плейсхолдер users.chatId для ещё не писавших боту пользователей мини-аппа) — тоже "нет чата".
    const targetChatId = vacancy.employerChatId || employer?.chatId;
    if (!targetChatId) {
        throw new Error(`cannot publish vacancy ${vacancy.id}: no known chat to send the card to`);
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
        throw new PublishError('conflict', 'vacancy already published');
    }

    // Атомарный переход draft -> published: при параллельных запросах (двойной клик в мини-аппе,
    // повторная отправка формы) claim'ит только один запрос, остальные получат count === 0
    // и не станут слать вторую карточку в MAX на одну и ту же вакансию.
    const claim = await db.vacancy.updateMany({
        where: { id: vacancyId, status: 'draft' },
        data: { status: 'published' },
    });
    if (claim.count === 0) {
        throw new PublishError('conflict', 'vacancy already published or not in draft state');
    }

    const vacancy = await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });

    try {
        await publishVacancyCard(vacancy);
    } catch (err) {
        // Откатываем статус — не оставляем "published в БД", если карточка реально не ушла в MAX.
        await db.vacancy.update({ where: { id: vacancyId }, data: { status: 'draft' } }).catch(() => {});
        throw err;
    }

    return db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
}
