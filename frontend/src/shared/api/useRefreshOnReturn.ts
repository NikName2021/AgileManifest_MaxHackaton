import { useEffect, useRef } from 'react'

const cooldown = 5000
const settleDelay = 200

// No polling: coalesce focus/visibility events into one read after the app becomes visible.
export function useRefreshOnReturn(refresh: () => void, paused = false) {
  const pending = useRef(false)
  const lastRefresh = useRef(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function clear() {
      clearTimeout(timer)
      timer = undefined
    }
    function schedule() {
      if (paused || !pending.current || document.visibilityState !== 'visible') return
      clear()
      const delay = Math.max(settleDelay, cooldown - (Date.now() - lastRefresh.current))
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible') return
        pending.current = false
        lastRefresh.current = Date.now()
        refresh()
      }, delay)
    }
    function returned() {
      if (document.visibilityState !== 'visible') {
        clear()
        return
      }
      pending.current = true
      schedule()
    }
    function restored(event: PageTransitionEvent) {
      if (event.persisted) returned()
    }
    window.addEventListener('focus', returned)
    document.addEventListener('visibilitychange', returned)
    window.addEventListener('pageshow', restored)
    schedule()
    return () => {
      clear()
      window.removeEventListener('focus', returned)
      document.removeEventListener('visibilitychange', returned)
      window.removeEventListener('pageshow', restored)
    }
  }, [refresh, paused])
}
