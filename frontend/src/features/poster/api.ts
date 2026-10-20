import { ApiError } from '../../shared/api/client'
import { authUrl } from '../session/auth'

export async function fetchPoster(
  base: string,
  token: string,
  expire: () => void,
  id: number,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError('contract')
  let response: Response
  try {
    response = await fetch(authUrl(base, `/api/vacancies/${id}/poster.svg`, import.meta.env.PROD), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'image/svg+xml' },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    })
  } catch {
    if (signal?.aborted) throw signal.reason
    throw new ApiError('network')
  }
  if (!response.ok) {
    if (response.status === 401) expire()
    throw new ApiError(
      response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : 'server',
      response.status,
    )
  }
  if (!response.headers.get('content-type')?.includes('image/svg+xml'))
    throw new ApiError('contract')
  const blob = await response.blob()
  if (!blob.size || blob.size > 5_000_000) throw new ApiError('contract')
  return blob
}
