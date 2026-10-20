import { notifySubscribers } from '../subscriptions/service.js';
import { notifyPartnerChannels } from '../channels/service.js';

// Всё, что рассылается после успешной публикации. Запускается в фоне: ответ работодателю не ждёт
// рассылки, а её сбой не влияет на саму публикацию. Повторный вызов безопасен — рассылки
// помнят, кому уже отправили.
export function onVacancyPublished(vacancyId: number): Promise<void> {
  return Promise.allSettled([notifySubscribers(vacancyId), notifyPartnerChannels(vacancyId)]).then((results) => {
    for (const r of results) {
      if (r.status === 'rejected') console.error('post-publish broadcast failed', vacancyId, r.reason);
    }
  });
}
