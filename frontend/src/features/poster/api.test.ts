import { describe, expect, it, vi } from 'vitest'
import { fetchPoster } from './api'
describe('authenticated vacancy poster', () => {
  it('uses authorization headers without putting credentials in the SVG URL', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
    vi.stubGlobal('fetch', fetcher)
    const blob = await fetchPoster('https://example.test', 'session-token', vi.fn(), 12)
    expect(blob.type).toBe('image/svg+xml')
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/api/vacancies/12/poster.svg',
      expect.objectContaining({
        headers: { Authorization: 'Bearer session-token', Accept: 'image/svg+xml' },
        redirect: 'error',
      }),
    )
  })
  it('rejects an HTML response and expires an unauthorized session', async () => {
    const expire = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('login', { headers: { 'content-type': 'text/html' } }))
        .mockResolvedValueOnce(new Response('', { status: 401 })),
    )
    await expect(fetchPoster('https://example.test', 'token', expire, 1)).rejects.toMatchObject({
      kind: 'contract',
    })
    await expect(fetchPoster('https://example.test', 'token', expire, 1)).rejects.toMatchObject({
      kind: 'unauthorized',
    })
    expect(expire).toHaveBeenCalledOnce()
  })
})
