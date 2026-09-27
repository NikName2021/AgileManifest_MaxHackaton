import { describe, expect, it, vi } from 'vitest'
import { createBenchmarkRepository, parseBenchmark } from './api'

const data = { avgSalaryMin: 70000, avgSalaryMax: 50000, vacancyCount: 28, isFresh: true }
describe('salary benchmark contract', () => {
  it('preserves independent averages, missing amounts, zero and stale cache', () => {
    expect(parseBenchmark(data)).toEqual(data)
    expect(
      parseBenchmark({ ...data, avgSalaryMin: null, avgSalaryMax: 0, isFresh: false }),
    ).toEqual({ ...data, avgSalaryMin: null, avgSalaryMax: 0, isFresh: false })
  })
  it.each([
    null,
    {},
    { ...data, avgSalaryMin: '45000' },
    { ...data, avgSalaryMax: -1 },
    { ...data, avgSalaryMin: Infinity },
    { ...data, vacancyCount: 1.5 },
    { ...data, vacancyCount: -1 },
    { ...data, isFresh: 'true' },
  ])('rejects an invalid response: %j', (body) => {
    expect(() => parseBenchmark(body)).toThrow('contract')
  })
  it('encodes the job title and region, preserves the API base path and sends no credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))
    vi.stubGlobal('fetch', fetcher)
    const api = createBenchmarkRepository('https://example.test/service/')
    await expect(
      api.get({ position: ' Повар & пекарь ', region: ' Тула/область ' }),
    ).resolves.toEqual(data)
    const [address, options] = fetcher.mock.calls[0]
    const url = new URL(address)
    expect(url.origin + url.pathname).toBe('https://example.test/service/api/benchmark')
    expect([...url.searchParams]).toEqual([
      ['region_code', 'Тула/область'],
      ['category', 'Повар & пекарь'],
    ])
    expect(options.credentials).toBe('omit')
    expect(options.headers).not.toHaveProperty('Authorization')
    expect(options.body).toBeUndefined()
  })
  it('does not call the server without the required search parameters', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const api = createBenchmarkRepository('https://example.test')
    for (const query of [
      { position: ' ', region: 'Тула' },
      { position: 'Повар', region: '' },
    ])
      await expect(api.get(query)).rejects.toMatchObject({ kind: 'contract' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('propagates unavailability without automatic retries or exposing server messages', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'private' } }), {
        status: 404,
      }),
    )
    vi.stubGlobal('fetch', fetcher)
    await expect(
      createBenchmarkRepository('https://example.test').get({ position: 'Повар', region: 'Тула' }),
    ).rejects.toMatchObject({ kind: 'server', status: 404, message: 'server' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('forwards cancellation to the request', async () => {
    const controller = new AbortController()
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options: RequestInit) => {
        requestSignal = options.signal as AbortSignal
        return new Promise((_resolve, reject) =>
          requestSignal!.addEventListener('abort', () => reject(requestSignal!.reason)),
        )
      }),
    )
    const request = createBenchmarkRepository('https://example.test').get(
      { position: 'Повар', region: 'Тула' },
      controller.signal,
    )
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(requestSignal?.aborted).toBe(true)
  })
})
