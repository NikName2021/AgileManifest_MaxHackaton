// Подсказки при вводе (автодополнение) — общие для бейджей и сфер деятельности. Сравнение без учёта
// регистра и ё/е, по началу слова; падежи и опечатки в одну букву тоже находятся:
// «жил», «жилья», «жилё» → «Жильё бесплатно».

export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function searchWords(text: string): string[] {
  const normalized = normalizeForSearch(text);
  return normalized ? normalized.split(' ') : [];
}

// Расстояние Левенштейна с ранним выходом: нужно только «0, 1 или больше».
export function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Насколько слово запроса похоже на слово текста: 0 — не похоже.
function wordScore(query: string, word: string): number {
  if (word === query) return 10;
  if (word.startsWith(query)) return 8;
  // Падежные окончания: «жилья» ~ «жилье», «общепита» ~ «общепит».
  if (query.length >= 4) {
    const stem = query.slice(0, query.length - (query.length >= 6 ? 2 : 1));
    if (word.startsWith(stem)) return 6;
  }
  // Опечатка в одну букву в начале слова: «обшепит» ~ «общепит».
  if (query.length >= 4 && withinOneEdit(query, word.slice(0, query.length))) return 4;
  if (query.length >= 4 && withinOneEdit(query, word)) return 4;
  if (query.length >= 5 && word.includes(query)) return 2;
  return 0;
}

export interface SearchEntry {
  // Главная подпись: совпадение с ней весит больше, чем с синонимами.
  label: string;
  synonyms?: string[];
}

// Оценка записи для запроса: каждое слово запроса должно найтись в подписи или синонимах.
// 0 — не подходит. Совпадение всей фразы с началом подписи или синонима — максимальная оценка.
export function scoreEntry(query: string, entry: SearchEntry): number {
  const queryNorm = normalizeForSearch(query);
  if (!queryNorm) return 0;
  const labelNorm = normalizeForSearch(entry.label);
  const synonymsNorm = (entry.synonyms ?? []).map(normalizeForSearch);
  if (labelNorm === queryNorm) return 1000;
  if (synonymsNorm.includes(queryNorm)) return 900;
  if (labelNorm.startsWith(queryNorm)) return 800;
  if (synonymsNorm.some((s) => s.startsWith(queryNorm))) return 700;

  const labelWords = labelNorm.split(' ');
  const synonymWords = synonymsNorm.flatMap((s) => s.split(' '));
  let total = 0;
  for (const q of queryNorm.split(' ')) {
    const best = Math.max(
      ...labelWords.map((w) => wordScore(q, w) * 2),
      ...synonymWords.map((w) => wordScore(q, w)),
      0
    );
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

// Лучшие записи по убыванию оценки; при равенстве — исходный порядок (он же порядок справочника).
export function rankEntries<T>(query: string, items: T[], toEntry: (item: T) => SearchEntry, limit: number): { item: T; score: number }[] {
  return items
    .map((item, index) => ({ item, index, score: scoreEntry(query, toEntry(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ item, score }) => ({ item, score }));
}
