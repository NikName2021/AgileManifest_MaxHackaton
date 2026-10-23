import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createResourceClient } from './resourceClient'
import { useInvalidateResources, useResource } from './useResource'

function cache() {
  const client = createResourceClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('session resource cache', () => {
  it('deduplicates requests and immediately reuses data when returning to a tab', async () => {
    const { client, wrapper } = cache()
    const load = vi.fn().mockResolvedValue(['saved'])
    const first = renderHook(() => useResource(load, 'worker:jobs'), { wrapper })
    const second = renderHook(() => useResource(load, 'worker:jobs'), { wrapper })
    await waitFor(() => expect(first.result.current.result.state).toBe('ready'))
    expect(load).toHaveBeenCalledTimes(1)
    first.unmount()
    second.unmount()
    const returned = renderHook(() => useResource(load, 'worker:jobs'), { wrapper })
    expect(returned.result.current.result).toEqual({ state: 'ready', data: ['saved'] })
    expect(load).toHaveBeenCalledTimes(1)
    returned.unmount()
    client.clear()
  })

  it('invalidates cached tabs after a mutation and keeps old data while revalidating', async () => {
    const { client, wrapper } = cache()
    let resolve!: (value: string[]) => void
    const load = vi
      .fn()
      .mockResolvedValueOnce(['old'])
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
    const first = renderHook(() => useResource(load, 'employer:vacancies'), { wrapper })
    await waitFor(() => expect(first.result.current.result.state).toBe('ready'))
    first.unmount()
    const mutation = renderHook(useInvalidateResources, { wrapper })
    act(() => mutation.result.current())
    const returned = renderHook(() => useResource(load, 'employer:vacancies'), { wrapper })
    expect(returned.result.current.result).toEqual({ state: 'ready', data: ['old'] })
    await act(async () => resolve(['new']))
    await waitFor(() =>
      expect(returned.result.current.result).toEqual({ state: 'ready', data: ['new'] }),
    )
    returned.unmount()
    mutation.unmount()
    client.clear()
  })

  it('does not share private data with another session or another filter', async () => {
    const a = cache(),
      b = cache()
    a.client.setQueryData(['resource', 'worker:jobs:23'], ['private'])
    const load = vi.fn(() => new Promise<string[]>(() => {}))
    const otherSession = renderHook(() => useResource(load, 'worker:jobs:23'), {
      wrapper: b.wrapper,
    })
    const otherFilter = renderHook(() => useResource(load, 'worker:jobs:78'), {
      wrapper: a.wrapper,
    })
    expect(otherSession.result.current.result.state).toBe('loading')
    expect(otherFilter.result.current.result.state).toBe('loading')
    otherSession.unmount()
    otherFilter.unmount()
    a.client.clear()
    b.client.clear()
  })
})
