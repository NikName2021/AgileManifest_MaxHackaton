import { notifySubscribers } from '../subscriptions/service.js';
import { notifyPartnerChannels } from '../channels/service.js';

const inFlight = new Set<Promise<void>>();

// Всё, что рассылается после успешной публикации. Запускается в фоне: ответ работодателю не ждёт
// рассылки, а её сбой не влияет на саму публикацию. Повторный вызов безопасен — рассылки
// помнят, кому уже отправили.
export function onVacancyPublished(vacancyId: number): Promise<void> {
  const task = Promise.allSettled([notifySubscribers(vacancyId), notifyPartnerChannels(vacancyId)]).then((results) => {
    for (const r of results) {
      if (r.status === 'rejected') console.error('post-publish broadcast failed', vacancyId, r.reason);
    }
  });
  inFlight.add(task);
  void task.finally(() => inFlight.delete(task));
  return task;
}

// Дождаться фоновых рассылок, запущенных к этому моменту (тесты перед очисткой БД).
export async function settleBroadcasts(): Promise<void> {
  while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
}
