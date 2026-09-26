// Ник бота нужен для deep link (https://max.ru/<ник>?start=...). Определяем один раз при
// старте через GET /me (см. server.ts) и держим в памяти — постоянные повторные вызовы /me
// ради ника не нужны.
let cachedUsername: string | undefined;

export function setBotUsername(username: string | undefined): void {
  if (username) cachedUsername = username;
}

export function getBotUsername(): string | undefined {
  return cachedUsername;
}
