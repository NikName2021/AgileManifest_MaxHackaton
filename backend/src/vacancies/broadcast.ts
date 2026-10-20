import { notifySubscribers } from '../subscriptions/service.js';

// Всё, что рассылается после успешной публикации. Запускается в фоне: ответ работодателю не ждёт
// рассылки, а её сбой не влияет на саму публикацию. Повторный вызов безопасен — рассылки
// помнят, кому уже отправили.
export function onVacancyPublished(vacancyId: number): Promise<void> {
  return notifySubscribers(vacancyId)
    .then(() => undefined)
    .catch((err) => console.error('post-publish broadcast failed', vacancyId, err));
}
