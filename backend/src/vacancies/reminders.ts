import { db } from '../db.js';
import { maxApi } from '../max/client.js';
import { escapeMarkdown } from '../markdown.js';

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

    // Застывший employerChatId вакансии — приоритетнее "текущего" chatId работодателя из users
    // (см. users/service.ts). Пустая строка (плейсхолдер для пользователей мини-аппа) — тоже "нет чата".
    const targetChatId = vacancy.employerChatId || vacancy.employer?.chatId;
    if (!targetChatId) continue; // некому слать — не помечаем как обработанную, вдруг chatId появится позже

    try {
      await maxApi.sendMessage(
        targetChatId,
        `Вакансия «${escapeMarkdown(vacancy.title)}» опубликована больше ${STALE_AFTER_HOURS} часов назад, но пока нет ни одного отклика.\n\n` +
          'Возможно, стоит расширить условия или пересмотреть вилку зарплаты — напишите /новая_вакансия, чтобы создать обновлённую версию.'
      );
      remindersSent += 1;
      // Помечаем отправленной ТОЛЬКО при реальном успехе — раньше это делалось безусловно
      // ("в любом случае"), из-за чего неудачная отправка выглядела в БД как удачная и напоминание
      // больше никогда не повторялось, хотя фактически кандидат/работодатель его не получил.
      await db.vacancy.update({ where: { id: vacancy.id }, data: { reminderSentAt: new Date() } });
    } catch (err) {
      // Не роняем весь цикл проверки из-за одного неотправленного сообщения (например, чат недоступен).
      // Не помечаем reminderSentAt — следующий часовой прогон попробует отправить снова.
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
