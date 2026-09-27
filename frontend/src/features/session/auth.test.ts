import { describe, it, expect, vi } from 'vitest'
import { authenticate, authUrl, parseCredentials } from './auth'

const credentials = { token: 'session-fixture', user_id: 42 }
describe('server-verified session', () => {
  it('accepts only the verified response and drops extra fields', () => {
    expect(parseCredentials({ ...credentials, phone: 'not retained' })).toEqual({
      token: credentials.token,
      userId: 42,
    })
  })
  it.each([
    null,
    {},
    { ...credentials, user_id: '42' },
    { ...credentials, user_id: 0 },
    { ...credentials, token: '' },
  ])('rejects malformed responses: %j', (body) => {
    expect(() => parseCredentials(body)).toThrow('contract')
  })
  it('does not require a role field absent from the real backend', () => {
    expect(parseCredentials(credentials).userId).toBe(42)
  })
  it('sends init_data via POST without cookie credentials', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(credentials), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(
      authenticate(
        'https://api.example.test/api/auth/max',
        'signed-fixture',
        new AbortController().signal,
      ),
    ).resolves.toEqual({ token: credentials.token, userId: 42 })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/auth/max',
      expect.objectContaining({
        method: 'POST',
        body: '{"init_data":"signed-fixture"}',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      }),
    )
  })
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [503, 'server'],
  ] as const)('handles HTTP %s', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
    await expect(
      authenticate('/api/auth', 'signed-fixture', new AbortController().signal),
    ).rejects.toMatchObject({ kind })
  })
  it('handles a successful response with invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>not JSON</html>')))
    await expect(
      authenticate('/api/auth', 'signed-fixture', new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'contract' })
  })
  it('handles network failure without exposing response details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private server details')))
    await expect(
      authenticate('/api/auth', 'signed-fixture', new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'network', message: 'network' })
  })
})
describe('auth endpoint configuration', () => {
  it('joins configured base path and endpoint', () => {
    expect(authUrl('https://api.example.test/v1/', '/api/auth/max', true)).toBe(
      'https://api.example.test/v1/api/auth/max',
    )
  })
  it.each([
    'https://other.test/auth',
    '//other.test/auth',
    '/\\other.test',
    '/auth?token=x',
    '/auth#hash',
  ])('rejects unsafe path %s', (path) => {
    expect(() => authUrl('https://api.example.test', path, true)).toThrow('contract')
  })
  it('requires HTTPS in production', () => {
    expect(() => authUrl('http://api.example.test', '/api/auth', true)).toThrow('contract')
    expect(authUrl('http://localhost:3000', '/api/auth', false)).toBe(
      'http://localhost:3000/api/auth',
    )
  })
})
