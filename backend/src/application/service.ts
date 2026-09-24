import { db } from '../db.js';
import { maxApi } from '../max/client.js';

export async function handleApplyClick(candidateChatId: string, candidateMaxUserId: string, vacancyId: number) {
    const candidate = await db.user.findUnique({ where: { maxUserId: candidateMaxUserId } });
    if (!candidate) {
        await maxApi.sendMessage(candidateChatId, 'Не получилось оформить отклик, попробуйте ещё раз чуть позже.');
        return;
    }

    const vacancy = await db.vacancy.findUnique({
        where: { id: vacancyId },
        include: { employer: true },
    });
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

    await db.application.create({
        data: { vacancyId, candidateUserId: candidate.id, status: 'new' },
    });

    await maxApi.sendMessage(
        candidateChatId,
        `Отклик отправлен! Работодатель получит уведомление и свяжется с вами по вакансии «${vacancy.title}».`
    );

    await maxApi.sendMessage(
        vacancy.employer.chatId,
        `Новый отклик на вакансию «${vacancy.title}»:\nКандидат: ${candidate.displayName ?? 'без имени в MAX'}.\n` +
        `TODO(v2): прямой контакт кандидата — пока свяжитесь через MAX-чат с ним напрямую.`
    );
}