export class ApiError extends Error {
  readonly kind: 'unauthorized' | 'forbidden' | 'network' | 'server' | 'contract'
  constructor(kind: ApiError['kind']) {
    super(kind)
    this.name = 'ApiError'
    this.kind = kind
  }
}

export async function requestJson(url: string, options: RequestInit = {}): Promise<unknown> {
  const timeout = AbortSignal.timeout(10000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal,
    })
  } catch {
    if (options.signal?.aborted) throw options.signal.reason
    throw new ApiError('network')
  }
  if (response.status === 401) throw new ApiError('unauthorized')
  if (response.status === 403) throw new ApiError('forbidden')
  if (!response.ok) throw new ApiError('server')
  try {
    return await response.json()
  } catch {
    throw new ApiError('contract')
  }
}
