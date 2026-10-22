import type { Category, CategorySuggestion } from '../features/categories/api'
export const categories: Category[] = [
  { name: 'Сельское хозяйство', emoji: '🌾', vacancies: 0 },
  { name: 'Общепит', emoji: '🍽️', vacancies: 0 },
  { name: 'Гостиницы и туризм', emoji: '🏨', vacancies: 0 },
  { name: 'Детский отдых', emoji: '🏕️', vacancies: 0 },
  { name: 'Торговля', emoji: '🛒', vacancies: 0 },
  { name: 'Склад и логистика', emoji: '📦', vacancies: 0 },
  { name: 'Доставка', emoji: '🚴', vacancies: 0 },
  { name: 'Транспорт и водители', emoji: '🚗', vacancies: 0 },
  { name: 'Строительство', emoji: '🏗️', vacancies: 0 },
  { name: 'Производство', emoji: '🏭', vacancies: 0 },
  { name: 'Уборка и клининг', emoji: '🧹', vacancies: 0 },
  { name: 'Мероприятия и развлечения', emoji: '🎪', vacancies: 0 },
  { name: 'Красота и спорт', emoji: '💆', vacancies: 0 },
  { name: 'Охрана', emoji: '🛡️', vacancies: 0 },
  { name: 'Образование', emoji: '📚', vacancies: 0 },
  { name: 'Медицина', emoji: '🩺', vacancies: 0 },
  { name: 'Офис и call-центр', emoji: '💻', vacancies: 0 },
  { name: 'Другое', emoji: '📌', vacancies: 0 },
]
export function suggestCategory(q: string): CategorySuggestion {
  const clean = q.toLocaleLowerCase('ru').trim()
  const exact = categories.find((c) => c.name.toLocaleLowerCase('ru') === clean)
  const synonym = ['кафе', 'кейтеринг', 'кейтринг', 'ресторан'].includes(clean)
    ? categories.find((c) => c.name === 'Общепит')
    : undefined
  const match = exact ? 'exact' : synonym ? 'synonym' : 'other'
  const resolved = exact ?? synonym
  return {
    resolved: { name: resolved?.name ?? 'Другое', match, detail: resolved ? null : q },
    items: resolved
      ? [resolved]
      : categories.filter((c) => c.name.toLocaleLowerCase('ru').includes(clean)),
  }
}
