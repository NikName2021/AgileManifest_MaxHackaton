import { db } from '../db.js';
import { maxApi } from '../max/client.js';
import { escapeMarkdown } from '../markdown.js';

// Напоминание работодателю о вакансии, которая опубликована давно и не получила откликов.
const STALE_AFTER_HOURS = 48;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export async function checkStaleVacanciesOnce(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_HOURS * 3600 * 1000);

  const candidates = await db.vacancy.findMany({
    where: {
      status: 'published',
      reminderSentAt: null,
      publishedAt: { lt: staleBefore },
    },
    include: {
      employer: true,
      _count: { select: { applications: true } },
    },
  });

  let remindersSent = 0;

  for (const vacancy of candidates) {
    if (vacancy._count.applications > 0) {
      await db.vacancy.update({ where: { id: vacancy.id }, data: { reminderSentAt: new Date() } });
      continue;
    }

    const targetChatId = vacancy.employerChatId || vacancy.employer?.chatId;
    if (!targetChatId) continue; // не помечаем: чат может появиться позже

    try {
      await maxApi.sendMessage(
        targetChatId,
        `Вакансия «${escapeMarkdown(vacancy.title)}» опубликована больше ${STALE_AFTER_HOURS} часов назад, но пока нет ни одного отклика.\n\n` +
          'Возможно, стоит расширить условия или пересмотреть вилку зарплаты — напишите /новая_вакансия, чтобы создать обновлённую версию.'
      );
      remindersSent += 1;
      // Помечаем только при успешной отправке, иначе напоминание больше не повторится.
      await db.vacancy.update({ where: { id: vacancy.id }, data: { reminderSentAt: new Date() } });
    } catch (err) {
      // Следующий прогон попробует снова.
      console.error('failed to send stale vacancy reminder, will retry next cycle', vacancy.id, err);
    }
  }

  return remindersSent;
}

export function startStaleVacancyReminders(): void {
  setInterval(() => {
    checkStaleVacanciesOnce().catch((err) => console.error('stale vacancy reminder check failed', err));
  }, CHECK_INTERVAL_MS);
}
