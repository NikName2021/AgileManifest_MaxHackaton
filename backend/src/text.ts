// Нормализация и проверки пользовательского текста — общие для REST (validation.ts) и диалога бота.

// Управляющие символы, невидимые пробелы нулевой ширины и символы смены направления текста: в
// карточке MAX они ломают вёрстку или прячут часть текста.
const FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/;
const MEANINGFUL = /[\p{L}\p{N}]/u;

// Однострочное поле: любые пробелы и переносы строк схлопываются в один пробел.
export function normalizeSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Многострочное поле: \r\n -> \n, пробелы в конце строк убираются, не больше одной пустой строки подряд.
export function normalizeMultiLine(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasForbiddenChars(text: string): boolean {
  return FORBIDDEN_CHARS.test(text);
}

// Есть хотя бы одна буква или цифра: «!!!» или «---» — не название и не контакт.
export function isMeaningful(text: string): boolean {
  return MEANINGFUL.test(text);
}

// Разумный потолок зарплаты в рублях: больше — почти наверняка лишние нули.
export const SALARY_MAX = 10_000_000;
