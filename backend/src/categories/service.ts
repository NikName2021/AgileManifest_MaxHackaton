import { db } from '../db.js';
import { normalizeForSearch, rankEntries, withinOneEdit } from '../suggest.js';
import { BUILT_IN_CATEGORIES, OTHER_CATEGORY, type BuiltInCategory } from './catalog.js';

// Вакансии, созданные без сферы (старый диалог бота, REST без category).
export const NO_CATEGORY = 'general';

export interface CategoryDto {
  name: string;
  emoji: string;
  // Сколько опубликованных вакансий в этой сфере сейчас.
  vacancies: number;
}

// Как введённый текст отнесён к сфере:
// exact — ровно название; synonym — синоним («кафе»); typo — опечатка в одну букву («кейтринг»);
// phrase — фраза, в которой есть название или синоним («сфера общественного питания»);
// other — не распознано, будет «Другое».
export type CategoryMatch = 'exact' | 'synonym' | 'typo' | 'phrase' | 'other';

export interface ResolvedCategory {
  name: string;
  match: CategoryMatch;
  // Для «Другое» — что написал работодатель (сохраняется в category_detail).
  detail: string | null;
}

export interface CategorySuggestion extends CategoryDto {
  // similar — просто похоже по началу слова; frontend предлагает «Заменить на «…»?».
  match: Exclude<CategoryMatch, 'other'> | 'similar';
}

const ALL: BuiltInCategory[] = [...BUILT_IN_CATEGORIES, { ...OTHER_CATEGORY, synonyms: ['другое', 'прочее', 'иное'] }];
const BY_NAME = new Map(ALL.map((c) => [c.name, c]));

// Каждое название и синоним — нормализованный «термин» со словами для поиска по фразе.
const TERMS = ALL.flatMap((category) =>
  [category.name, ...category.synonyms].map((term, index) => {
    const key = normalizeForSearch(term);
    return { category, key, words: key.split(' '), isName: index === 0 };
  })
);
const BY_KEY = new Map<string, (typeof TERMS)[number]>();
for (const term of TERMS) if (!BY_KEY.has(term.key)) BY_KEY.set(term.key, term);

// Слова совпадают с точностью до окончания: «общественного» ~ «общественное», «питания» ~ «питание».
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 5) return false;
  const stem = Math.max(5, shorter - 2);
  return a.slice(0, stem) === b.slice(0, stem);
}

export function isCategoryName(name: string): boolean {
  return BY_NAME.has(name);
}

// Отнести текст к сфере справочника. Никогда не создаёт новых сфер: нераспознанное — «Другое».
export function matchCategory(text: string): ResolvedCategory {
  const key = normalizeForSearch(text);
  const detail = text.trim().replace(/\s+/g, ' ');
  if (!key) return { name: OTHER_CATEGORY.name, match: 'other', detail: null };

  const exact = BY_KEY.get(key);
  if (exact) {
    const isOther = exact.category.name === OTHER_CATEGORY.name;
    return { name: exact.category.name, match: exact.isName || isOther ? 'exact' : 'synonym', detail: null };
  }

  // Опечатка в одну букву во всём названии или синониме: «кейтринг» → «кейтеринг» → «Общепит».
  if (key.length >= 5) {
    const typo = TERMS.find((t) => t.key.length >= 5 && withinOneEdit(key, t.key));
    if (typo) return { name: typo.category.name, match: 'typo', detail: null };
  }

  // Фраза: все слова какого-то названия или синонима есть в тексте. Если подходят разные сферы,
  // берём ту, где совпало больше слов; ничья — не угадываем.
  const words = key.split(' ');
  const scores = new Map<string, number>();
  for (const term of TERMS) {
    if (term.category.name === OTHER_CATEGORY.name) continue;
    if (term.words.every((w) => words.some((x) => sameWord(w, x)))) {
      scores.set(term.category.name, Math.max(scores.get(term.category.name) ?? 0, term.words.length));
    }
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  if (ranked.length > 0 && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
    return { name: ranked[0][0], match: 'phrase', detail: null };
  }

  return { name: OTHER_CATEGORY.name, match: 'other', detail };
}

// Сфера для сохранения в вакансии. Нераспознанный текст записывается в журнал промахов — по нему
// команда добавляет синонимы, а вакансия получает «Другое» и исходный текст в category_detail.
export async function resolveCategory(text: string): Promise<{ category: string; categoryDetail: string | null }> {
  const resolved = matchCategory(text);
  if (resolved.match === 'other' && resolved.detail) {
    const normKey = normalizeForSearch(resolved.detail);
    await db.categoryMiss.upsert({
      where: { normKey },
      update: { uses: { increment: 1 } },
      create: { text: resolved.detail, normKey },
    });
  }
  return { category: resolved.name, categoryDetail: resolved.detail };
}

// Сфера для фильтра подписки или канала: только распознанная. null — текст не похож ни на одну
// сферу (подписка с ним молча не получала бы ничего). «Другое» можно выбрать явно.
export function findCategory(text: string): string | null {
  const resolved = matchCategory(text);
  return resolved.match === 'other' ? null : resolved.name;
}

async function publishedCounts(): Promise<Map<string, number>> {
  const rows = await db.vacancy.groupBy({ by: ['category'], where: { status: 'published' }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.category, r._count._all]));
}

// Весь справочник в его порядке, «Другое» — последним; число опубликованных вакансий в каждой.
export async function listCategories(): Promise<CategoryDto[]> {
  const counts = await publishedCounts();
  return ALL.map((c) => ({ name: c.name, emoji: c.emoji, vacancies: counts.get(c.name) ?? 0 }));
}

// Автодополнение: «каф» → «Общепит», «обшепит» → «Общепит». Синонимы ищутся по началу слова.
export async function suggestCategories(query: string, limit: number): Promise<{ resolved: ResolvedCategory; items: CategorySuggestion[] }> {
  const counts = await publishedCounts();
  const resolved = matchCategory(query);
  const ranked = rankEntries(query, ALL, (c) => ({ label: c.name, synonyms: c.synonyms }), limit).map(({ item }) => item);
  // Распознанная сфера (опечатка, фраза) — первой, даже если поиск по началу слова её не нашёл.
  if (resolved.match !== 'other') {
    const index = ranked.findIndex((c) => c.name === resolved.name);
    if (index !== 0) {
      if (index > 0) ranked.splice(index, 1);
      ranked.unshift(BY_NAME.get(resolved.name)!);
    }
  }
  const items = ranked.slice(0, limit).map((c) => ({
    name: c.name,
    emoji: c.emoji,
    vacancies: counts.get(c.name) ?? 0,
    match: c.name === resolved.name && resolved.match !== 'other' ? resolved.match : ('similar' as const),
  }));
  return { resolved, items };
}

// Сферы вакансий, созданных до справочника: распознанные — к названию, остальные — в «Другое» с
// исходным текстом. Идемпотентно: трогает только сферы не из справочника.
export async function backfillCategories(): Promise<number> {
  const rows = await db.vacancy.findMany({
    where: { category: { notIn: [...BY_NAME.keys(), NO_CATEGORY] } },
    select: { id: true, category: true },
  });
  for (const row of rows) {
    const { category, categoryDetail } = await resolveCategory(row.category);
    await db.vacancy.update({ where: { id: row.id }, data: { category, categoryDetail } });
  }
  return rows.length;
}
