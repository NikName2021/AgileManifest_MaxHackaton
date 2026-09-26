export class ApiError extends Error {
  readonly kind: 'unauthorized' | 'forbidden' | 'network' | 'server' | 'contract'
  readonly status: number
  readonly code: string
  readonly fields: string[]
  constructor(kind: ApiError['kind'], status = 0, code = '', fields: string[] = []) {
    super(kind)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
    this.fields = fields
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
        ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal,
    })
  } catch {
    if (options.signal?.aborted) throw options.signal.reason
    throw new ApiError('network')
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const error = body && typeof body === 'object' && 'error' in body ? body.error : null
    const details = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
    throw new ApiError(
      response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : 'server',
      response.status,
      typeof details.code === 'string' ? details.code : '',
      details.fields && typeof details.fields === 'object' ? Object.keys(details.fields) : [],
    )
  }
  try {
    return await response.json()
  } catch {
    throw new ApiError('contract')
  }
}
