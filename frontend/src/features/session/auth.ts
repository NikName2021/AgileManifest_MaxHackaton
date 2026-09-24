import type { User } from '../../entities/hiring'
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

export function parseUser(body: unknown): User {
  if (!body || typeof body !== 'object' || !('user' in body)) throw new ApiError('contract')
  const user = body.user
  if (!user || typeof user !== 'object') throw new ApiError('contract')
  const value = user as Record<string, unknown>
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.max_user_id !== 'string' ||
    !value.max_user_id ||
    typeof value.display_name !== 'string' ||
    !value.display_name.trim() ||
    !['employer', 'candidate'].includes(String(value.role))
  ) {
    throw new ApiError('contract')
  }
  // Current workspace is for employers; role comes only from the verified backend response.
  if (value.role !== 'employer') throw new ApiError('forbidden')
  return {
    id: value.id,
    max_user_id: value.max_user_id,
    display_name: value.display_name,
    role: 'employer',
  }
}

export async function authenticate(
  url: string,
  initData: string,
  signal: AbortSignal,
): Promise<User> {
  return parseUser(
    await requestJson(url, { method: 'POST', body: JSON.stringify({ initData }), signal }),
  )
}
