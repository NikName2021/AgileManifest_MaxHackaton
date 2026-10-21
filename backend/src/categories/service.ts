import { db } from '../db.js';
import { normalizeForSearch, rankEntries, withinOneEdit } from '../suggest.js';
import { BUILT_IN_CATEGORIES, type BuiltInCategory } from './catalog.js';

// Вакансии, созданные без сферы (старый диалог бота, REST без category).
export const NO_CATEGORY = 'general';

export interface CategoryDto {
  name: string;
  emoji: string | null;
  builtIn: boolean;
  // Сколько опубликованных вакансий в этой сфере сейчас.
  vacancies: number;
}

// exact — введено ровно название; synonym — синоним встроенной сферы (при сохранении заменится
// автоматически); similar — просто похоже, frontend предлагает заменить.
export type CategoryMatch = 'exact' | 'synonym' | 'similar';

export interface CategorySuggestion extends CategoryDto {
  match: CategoryMatch;
}

const BUILT_IN_BY_KEY = new Map<string, BuiltInCategory>();
for (const category of BUILT_IN_CATEGORIES) {
  BUILT_IN_BY_KEY.set(normalizeForSearch(category.name), category);
}
for (const category of BUILT_IN_CATEGORIES) {
  for (const synonym of category.synonyms) {
    const key = normalizeForSearch(synonym);
    if (!BUILT_IN_BY_KEY.has(key)) BUILT_IN_BY_KEY.set(key, category);
  }
}

// Существующая сфера: встроенная (по названию или синониму) или добавленная работодателями раньше.
export async function findCategory(text: string): Promise<{ name: string; match: 'exact' | 'synonym' } | null> {
  const key = normalizeForSearch(text);
  if (!key) return null;
  const builtIn = BUILT_IN_BY_KEY.get(key);
  if (builtIn) return { name: builtIn.name, match: normalizeForSearch(builtIn.name) === key ? 'exact' : 'synonym' };
  const custom = await db.category.findUnique({ where: { normKey: key } });
  return custom ? { name: custom.name, match: 'exact' } : null;
}

// Опечатка в одну букву во всём названии или синониме встроенной сферы: «Обшепит» → «Общепит».
function builtInTypoMatch(text: string): string | null {
  const key = normalizeForSearch(text);
  if (key.length < 5) return null;
  for (const [candidate, category] of BUILT_IN_BY_KEY) {
    if (withinOneEdit(key, candidate)) return category.name;
  }
  return null;
}

// Сфера для сохранения в вакансии. Существующая — её точное название (синоним заменяется на
// название); новая — заводится, чтобы её предлагали другим. fixTypos — для диалога бота, где
// переспросить «вы имели в виду…» нельзя: явная опечатка во встроенной сфере исправляется сама.
export async function resolveCategory(text: string, { fixTypos = false } = {}): Promise<string> {
  const found = await findCategory(text);
  if (found) return found.name;
  if (fixTypos) {
    const typo = builtInTypoMatch(text);
    if (typo) return typo;
  }
  const name = text.trim();
  const normKey = normalizeForSearch(name);
  await db.category.upsert({ where: { normKey }, update: {}, create: { name, normKey } });
  return name;
}

async function publishedCounts(): Promise<Map<string, number>> {
  const rows = await db.vacancy.groupBy({ by: ['category'], where: { status: 'published' }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.category, r._count._all]));
}

// Встроенные сферы и добавленные работодателями (без повторов встроенных), популярные — первыми.
async function allCategories(): Promise<CategoryDto[]> {
  const [custom, counts] = await Promise.all([db.category.findMany({ orderBy: { id: 'asc' } }), publishedCounts()]);
  const items: CategoryDto[] = [
    ...BUILT_IN_CATEGORIES.map((c) => ({ name: c.name, emoji: c.emoji, builtIn: true, vacancies: counts.get(c.name) ?? 0 })),
    ...custom
      .filter((c) => !BUILT_IN_BY_KEY.has(c.normKey))
      .map((c) => ({ name: c.name, emoji: null, builtIn: false, vacancies: counts.get(c.name) ?? 0 })),
  ];
  // Стабильная сортировка: при равном числе вакансий встроенные идут в порядке справочника.
  return items.sort((a, b) => b.vacancies - a.vacancies);
}

// Список для выбора: все встроенные и те добавленные, в которых сейчас есть вакансии.
export async function listCategories(): Promise<CategoryDto[]> {
  return (await allCategories()).filter((c) => c.builtIn || c.vacancies > 0);
}

const SYNONYMS = new Map(BUILT_IN_CATEGORIES.map((c) => [c.name, c.synonyms]));

// Автодополнение: «каф» → «Общепит» (синоним «кафе»), «обшепит» → «Общепит» (опечатка).
export async function suggestCategories(query: string, limit: number): Promise<CategorySuggestion[]> {
  const key = normalizeForSearch(query);
  const ranked = rankEntries(query, await allCategories(), (c) => ({ label: c.name, synonyms: SYNONYMS.get(c.name) }), limit);
  return ranked.map(({ item }) => {
    const exact = normalizeForSearch(item.name) === key;
    const synonym = !exact && (SYNONYMS.get(item.name) ?? []).some((s) => normalizeForSearch(s) === key);
    return { ...item, match: exact ? 'exact' : synonym ? 'synonym' : 'similar' };
  });
}
