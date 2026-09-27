import { ApiError, requestJson } from '../../shared/api/client'

export function authUrl(base: string, path: string, production: boolean): string {
  // Do not let the path redirect MAX initData to an arbitrary host.
  if (!path.startsWith('/') || path.startsWith('//') || /[\\?#]/.test(path))
    throw new ApiError('contract')
  let url: URL
  try {
    url = new URL(base || window.location.origin)
  } catch {
    throw new ApiError('contract')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ApiError('contract')
  }
  if (production && url.protocol !== 'https:') throw new ApiError('contract')
  return `${url.origin}${url.pathname.replace(/\/$/, '')}${path}`
}

export interface AuthCredentials {
  token: string
  userId: number
}

export function parseCredentials(body: unknown): AuthCredentials {
  if (!body || typeof body !== 'object') throw new ApiError('contract')
  const value = body as Record<string, unknown>
  if (
    typeof value.token !== 'string' ||
    !value.token.trim() ||
    typeof value.user_id !== 'number' ||
    !Number.isSafeInteger(value.user_id) ||
    value.user_id <= 0
  ) {
    throw new ApiError('contract')
  }
  return { token: value.token, userId: value.user_id }
}

export async function authenticate(
  url: string,
  initData: string,
  signal: AbortSignal,
): Promise<AuthCredentials> {
  return parseCredentials(
    await requestJson(url, {
      method: 'POST',
      body: JSON.stringify({ init_data: initData }),
      signal,
    }),
  )
}
