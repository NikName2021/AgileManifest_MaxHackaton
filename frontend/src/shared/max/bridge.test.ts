import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindBackButton, loadBridge } from './bridge'
afterEach(() => {
  window.WebApp = undefined
  vi.useRealTimers()
  document.head.innerHTML = ''
})
describe('MAX bridge adapter', () => {
  it('binds native back and removes the exact handler during cleanup', () => {
    const BackButton = { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() }
    const goBack = vi.fn()
    const cleanup = bindBackButton({ BackButton, initData: '', platform: 'web' }, true, goBack)
    expect(BackButton.show).toHaveBeenCalledOnce()
    expect(BackButton.onClick).toHaveBeenCalledWith(goBack)
    cleanup()
    expect(BackButton.offClick).toHaveBeenCalledWith(goBack)
    expect(BackButton.hide).toHaveBeenCalledOnce()
  })
  it('hides native back at the root', () => {
    const BackButton = { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() }
    bindBackButton({ BackButton, initData: '', platform: 'ios' }, false, vi.fn())
    expect(BackButton.hide).toHaveBeenCalledOnce()
    expect(BackButton.onClick).not.toHaveBeenCalled()
  })
  it('shares concurrent script loads and allows retry after timeout', async () => {
    vi.useFakeTimers()
    const first = loadBridge()
    expect(loadBridge()).toBe(first)
    const rejection = expect(first).rejects.toThrow('Bridge timeout')
    await vi.advanceTimersByTimeAsync(8000)
    await rejection
    expect(document.querySelector('script')).toBeNull()
    const second = loadBridge()
    expect(second).not.toBe(first)
    window.WebApp = {
      initData: '',
      platform: 'web',
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    }
    document.querySelector('script')?.dispatchEvent(new Event('load'))
    await expect(second).resolves.toBe(window.WebApp)
  })
})
