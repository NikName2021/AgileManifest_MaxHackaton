import { db } from '../db.js';
import { maxApi } from '../max/client.js';
import type { Vacancy } from '@prisma/client';

export async function publishVacancyCard(vacancy: Vacancy) {
    const salaryText = vacancy.salaryMin && vacancy.salaryMax
        ? `${vacancy.salaryMin}–${vacancy.salaryMax} ₽`
        : 'по договорённости';

    const text = [
        `**${vacancy.title}**`,
        `Регион: ${vacancy.regionCode}`,
        `График: ${vacancy.schedule}`,
        `Зарплата: ${salaryText}`,
        vacancy.description ? vacancy.description : undefined,
    ].filter(Boolean).join('\n');

    const employer = await db.user.findUnique({ where: { id: vacancy.employerUserId } });
    if (!employer) return;

    // TODO: пока карточка публикуется в чат самого работодателя (для демо и пересылки кандидатам).
    // Полноценная лента вакансий для кандидатов внутри бота — отдельная задача за рамками текущего MVP.
    const result = await maxApi.sendMessage(employer.chatId, text, [
        [{ type: 'callback', text: 'Откликнуться', payload: `apply:${vacancy.id}` }],
    ]);

    const cardMessageId = result?.message?.body?.mid; // TODO: сверить поле с реальным ответом MAX API
    if (cardMessageId) {
        await db.vacancy.update({ where: { id: vacancy.id }, data: { cardMessageId } });
    }
}