import { describe, it, expect, vi } from 'vitest'
import { authenticate, authUrl, parseUser } from './auth'

const user = { id: '1', max_user_id: '123', role: 'employer', display_name: 'Анна' }
describe('server-verified session', () => {
  it('accepts only the verified response and drops extra fields', () => {
    expect(parseUser({ user: { ...user, phone: 'not retained' } })).toEqual(user)
  })
  it.each([
    null,
    {},
    { user: {} },
    { user: { ...user, id: 1 } },
    { user: { ...user, display_name: '' } },
  ])('rejects malformed responses: %j', (body) => {
    expect(() => parseUser(body)).toThrow('contract')
  })
  it('does not grant employer access to candidates', () => {
    expect(() => parseUser({ user: { ...user, role: 'candidate' } })).toThrow('forbidden')
  })
  it('sends raw initData in POST only and keeps cookie credentials', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ user }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(
      authenticate(
        'https://api.example.test/api/auth/max',
        'signed-fixture',
        new AbortController().signal,
      ),
    ).resolves.toEqual(user)
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/auth/max',
      expect.objectContaining({
        method: 'POST',
        body: '{"initData":"signed-fixture"}',
        credentials: 'include',
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
