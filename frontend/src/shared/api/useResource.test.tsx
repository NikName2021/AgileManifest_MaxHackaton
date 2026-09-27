import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useResource } from './useResource'
import { ApiError } from './client'

describe('background resource refresh', () => {
  it('keeps visible data during a refresh and a network error, then recovers', async () => {
    let reject!: (error: unknown) => void
    const load = vi
      .fn<(signal: AbortSignal) => Promise<string[]>>()
      .mockResolvedValueOnce(['previous'])
      .mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail
          }),
      )
      .mockResolvedValueOnce(['updated'])
    const { result } = renderHook(() => useResource(load, 'all'))
    await waitFor(() =>
      expect(result.current.result).toEqual({ state: 'ready', data: ['previous'] }),
    )
    act(() => result.current.refresh())
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.result).toEqual({ state: 'ready', data: ['previous'] })
    await act(async () => reject(new ApiError('network')))
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.refreshError).toMatchObject({ kind: 'network' })
    expect(result.current.result).toEqual({ state: 'ready', data: ['previous'] })
    act(() => result.current.refresh())
    await waitFor(() =>
      expect(result.current.result).toEqual({ state: 'ready', data: ['updated'] }),
    )
    expect(result.current.refreshError).toBeUndefined()
  })
  it('aborts and discards an old refresh after the filter changes', async () => {
    let resolve!: (value: string) => void
    const load = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockResolvedValueOnce('old')
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      .mockResolvedValueOnce('new filter')
    const { result, rerender } = renderHook(({ key }) => useResource(load, key), {
      initialProps: { key: 'one' },
    })
    await waitFor(() => expect(result.current.result.state).toBe('ready'))
    act(() => result.current.refresh())
    const signal = load.mock.calls[1][0]
    rerender({ key: 'two' })
    expect(signal.aborted).toBe(true)
    await waitFor(() =>
      expect(result.current.result).toEqual({ state: 'ready', data: 'new filter' }),
    )
    await act(async () => resolve('late old result'))
    expect(result.current.result).toEqual({ state: 'ready', data: 'new filter' })
  })
  it('removes the snapshot when access is denied during a refresh', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce('private')
      .mockRejectedValueOnce(new ApiError('forbidden', 403))
    const { result } = renderHook(() => useResource(load, 'private'))
    await waitFor(() => expect(result.current.result.state).toBe('ready'))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.result.state).toBe('error'))
    expect(result.current.result).not.toHaveProperty('data')
  })
})
