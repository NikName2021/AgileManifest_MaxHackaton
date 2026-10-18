// Username бота для deep link: из MAX_BOT_USERNAME или GET /me при старте (server.ts).
let cachedUsername: string | undefined;

export function setBotUsername(username: string | undefined): void {
  if (username) cachedUsername = username;
}

export function getBotUsername(): string | undefined {
  return cachedUsername;
}
