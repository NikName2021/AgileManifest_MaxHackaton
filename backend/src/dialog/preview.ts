import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { publishVacancy, PublishError } from '../vacancies/publish.js';

export function draftDecisionButtons(vacancyId: number): InlineButton[][] {
  return [[
    { type: 'callback', text: 'Опубликовать', payload: `draft_publish:${vacancyId}` },
    { type: 'callback', text: 'Оставить черновиком', payload: `draft_keep:${vacancyId}` },
  ]];
}

// Решение по предпросмотру карточки после диалога создания вакансии.
export async function handleDraftDecision(chatId: string, senderMaxUserId: string, vacancyId: number, action: string) {
  if (action !== 'publish' && action !== 'keep') return;
  const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId }, include: { employer: true } });
  // Решает только автор вакансии — в группе кнопку видят все.
  if (!vacancy || vacancy.employer.maxUserId !== senderMaxUserId) return;

  if (action === 'keep') {
    const text = vacancy.status === 'draft'
      ? 'Черновик сохранён. Его можно отредактировать и опубликовать в мини-приложении «Сезон» или кнопкой «Опубликовать» выше.'
      : 'Эта вакансия уже опубликована.';
    await maxApi.sendMessage(chatId, text);
    return;
  }

  try {
    await publishVacancy(vacancyId);
  } catch (err) {
    if (err instanceof PublishError && err.kind === 'conflict') {
      await maxApi.sendMessage(chatId, vacancy.status === 'closed' ? 'Вакансия закрыта — опубликовать её нельзя.' : 'Эта вакансия уже опубликована.');
      return;
    }
    console.error('failed to publish vacancy from preview', vacancyId, err);
    await maxApi.sendMessage(
      chatId,
      'Не получилось отправить карточку — попробуйте нажать «Опубликовать» ещё раз чуть позже. Дубля карточки не будет.'
    );
    return;
  }

  await maxApi.sendMessage(
    chatId,
    'Опубликовано! Карточку выше можно пересылать в чаты и каналы — ссылка для отклика есть прямо в тексте.\n' +
      'Как только кто-то откликнется, вы получите уведомление в этом чате.'
  );
}
