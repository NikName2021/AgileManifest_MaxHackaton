import { afterEach, describe, expect, it } from 'vitest'
import { hasMaxLaunch } from './launch'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  window.WebApp = undefined
})

describe('MAX launch detection', () => {
  it.each(['/', '/jobs/30', '/#welcome-about', '/?utm_source=max'])(
    'keeps ordinary browser visits public: %s',
    (url) => {
      window.history.replaceState(null, '', url)
      expect(hasMaxLaunch()).toBe(false)
    },
  )
  it.each([
    '/#WebAppData=signed&WebAppPlatform=web',
    '/#WebAppPlatform=ios',
    '/?WebAppData=signed',
  ])('keeps MAX launches on the authentication path: %s', (url) => {
    window.history.replaceState(null, '', url)
    expect(hasMaxLaunch()).toBe(true)
  })
  it('recognizes an already initialized native bridge', () => {
    window.WebApp = {
      initData: 'signed',
      platform: 'android',
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    }
    expect(hasMaxLaunch()).toBe(true)
  })
})
