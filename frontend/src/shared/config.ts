export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() ?? '',
  authPath: import.meta.env.VITE_AUTH_PATH?.trim() ?? '',
  botUrl: safeBotUrl(import.meta.env.VITE_BOT_URL),
  allowPreview: import.meta.env.DEV && (import.meta.env.VITE_ENABLE_DEV_MODE ?? 'true') === 'true',
}

function safeBotUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['https://max.ru', 'https://web.max.ru'].includes(url.origin) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
