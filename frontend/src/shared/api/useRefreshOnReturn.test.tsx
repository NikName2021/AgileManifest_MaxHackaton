import { act, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRefreshOnReturn } from './useRefreshOnReturn'

afterEach(() => vi.useRealTimers())
function setup(paused = false) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-27T12:00:00Z'))
  let visibility: DocumentVisibilityState = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  const refresh = vi.fn()
  const hook = renderHook(({ paused }) => useRefreshOnReturn(refresh, paused), {
    initialProps: { paused },
  })
  return {
    refresh,
    ...hook,
    visibility: (value: DocumentVisibilityState) => {
      visibility = value
      fireEvent(document, new Event('visibilitychange'))
    },
  }
}
describe('refresh on return', () => {
  it('does not poll and coalesces visibility and focus into one refresh', () => {
    const view = setup()
    act(() => vi.advanceTimersByTime(60000))
    expect(view.refresh).not.toHaveBeenCalled()
    view.visibility('hidden')
    fireEvent.focus(window)
    act(() => vi.advanceTimersByTime(300))
    expect(view.refresh).not.toHaveBeenCalled()
    view.visibility('visible')
    fireEvent.focus(window)
    act(() => vi.advanceTimersByTime(200))
    expect(view.refresh).toHaveBeenCalledOnce()
    act(() => vi.advanceTimersByTime(60000))
    expect(view.refresh).toHaveBeenCalledOnce()
  })
  it('defers events until a dialog or an in-flight load finishes', () => {
    const view = setup(true)
    fireEvent.focus(window)
    act(() => vi.advanceTimersByTime(10000))
    expect(view.refresh).not.toHaveBeenCalled()
    view.rerender({ paused: false })
    act(() => vi.advanceTimersByTime(200))
    expect(view.refresh).toHaveBeenCalledOnce()
  })
  it('throttles repeated focus but performs the pending refresh once visible', () => {
    const view = setup()
    fireEvent.focus(window)
    act(() => vi.advanceTimersByTime(200))
    fireEvent.focus(window)
    act(() => vi.advanceTimersByTime(1000))
    expect(view.refresh).toHaveBeenCalledOnce()
    view.visibility('hidden')
    act(() => vi.advanceTimersByTime(5000))
    expect(view.refresh).toHaveBeenCalledOnce()
    view.visibility('visible')
    act(() => vi.advanceTimersByTime(200))
    expect(view.refresh).toHaveBeenCalledTimes(2)
  })
  it('cancels a scheduled refresh on unmount', () => {
    const view = setup()
    fireEvent.focus(window)
    view.unmount()
    act(() => vi.advanceTimersByTime(10000))
    expect(view.refresh).not.toHaveBeenCalled()
  })
})
