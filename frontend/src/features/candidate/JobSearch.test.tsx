import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { JobSearch } from './JobSearch'

afterEach(() => vi.useRealTimers())

describe('automatic vacancy search', () => {
  it('waits a full second after the last keystroke, retains filters and resets pagination', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(
      <JobSearch params={new URLSearchParams('offset=20&region_code=23')} onSearch={onSearch} />,
    )
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'по' } })
    act(() => vi.advanceTimersByTime(800))
    fireEvent.change(input, { target: { value: 'повар' } })
    act(() => vi.advanceTimersByTime(999))
    expect(onSearch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onSearch).toHaveBeenCalledOnce()
    expect(Object.fromEntries(onSearch.mock.calls[0][0])).toEqual({ q: 'повар', region_code: '23' })
  })
  it('restores the URL query after back navigation without replaying an obsolete search', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    const view = render(<JobSearch params={new URLSearchParams('q=повар')} onSearch={onSearch} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'сборщик' } })
    act(() => vi.advanceTimersByTime(500))
    view.rerender(<JobSearch params={new URLSearchParams()} onSearch={onSearch} />)
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(onSearch).not.toHaveBeenCalled()
  })
})
