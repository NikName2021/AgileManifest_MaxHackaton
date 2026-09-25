import { db } from '../db.js';
import { maxApi } from '../max/client.js';

// "Should Have" из раздела 2 и раздела 16 ТЗ (Фаза 4 / "если останется время") —
// напоминание работодателю о вакансии, которая опубликована давно, но не получила ни одного отклика.
const STALE_AFTER_HOURS = 48;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // раз в час достаточно для MVP-масштаба

export async function checkStaleVacanciesOnce(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_HOURS * 3600 * 1000);

  const candidates = await db.vacancy.findMany({
    where: {
      status: 'published',
      reminderSentAt: null,
      createdAt: { lt: staleBefore },
    },
    include: {
      employer: true,
      _count: { select: { applications: true } },
    },
  });

  let remindersSent = 0;

  for (const vacancy of candidates) {
    // У вакансии уже есть отклики — она не "зависшая", просто больше не проверяем её в этом цикле.
    if (vacancy._count.applications > 0) {
      await db.vacancy.update({ where: { id: vacancy.id }, data: { reminderSentAt: new Date() } });
      continue;
    }

    if (!vacancy.employer?.chatId) continue;

    try {
      await maxApi.sendMessage(
        vacancy.employer.chatId,
        `Вакансия «${vacancy.title}» опубликована больше ${STALE_AFTER_HOURS} часов назад, но пока нет ни одного отклика.\n\n` +
          'Возможно, стоит расширить условия или пересмотреть вилку зарплаты — напишите /новая_вакансия, чтобы создать обновлённую версию.'
      );
      remindersSent += 1;
    } catch (err) {
      // Не роняем весь цикл проверки из-за одного неотправленного сообщения (например, чат недоступен).
      console.error('failed to send stale vacancy reminder', vacancy.id, err);
    }

    // Помечаем как обработанную в любом случае, чтобы не пытаться слать повторно каждый час при ошибке.
    await db.vacancy.update({ where: { id: vacancy.id }, data: { reminderSentAt: new Date() } });
  }

  return remindersSent;
}

export function startStaleVacancyReminders(): void {
  setInterval(() => {
    checkStaleVacanciesOnce().catch((err) => console.error('stale vacancy reminder check failed', err));
  }, CHECK_INTERVAL_MS);
}
