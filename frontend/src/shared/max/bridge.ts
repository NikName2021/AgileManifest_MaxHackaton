// Documented subset: https://dev.max.ru/docs/webapps/bridge
export interface MaxBridge {
  initData: string
  platform: string
  BackButton: {
    show(): void
    hide(): void
    onClick(callback: () => void): void
    offClick(callback: () => void): void
  }
}

declare global {
  interface Window {
    WebApp?: MaxBridge
  }
}

let loading: Promise<MaxBridge> | undefined
export function loadBridge(): Promise<MaxBridge> {
  if (window.WebApp) return Promise.resolve(window.WebApp)
  if (loading) return loading
  loading = new Promise<MaxBridge>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://st.max.ru/js/max-web-app.js'
    script.async = true
    const finish = (error?: Error) => {
      clearTimeout(timer)
      script.onload = null
      script.onerror = null
      if (error || !window.WebApp) {
        script.remove()
        reject(error ?? new Error('Bridge unavailable'))
      } else resolve(window.WebApp)
    }
    const timer = window.setTimeout(() => finish(new Error('Bridge timeout')), 8000)
    script.onload = () => finish()
    script.onerror = () => finish(new Error('Bridge unavailable'))
    document.head.append(script)
  }).catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}

export function bindBackButton(
  bridge: MaxBridge | undefined,
  visible: boolean,
  goBack: () => void,
) {
  const button = bridge?.BackButton
  if (!button) return () => {}
  try {
    if (visible) {
      button.show()
      button.onClick(goBack)
    } else button.hide()
  } catch {
    /* Native navigation is optional; an in-app back link is always available. */
  }
  return () => {
    try {
      button.offClick(goBack)
      button.hide()
    } catch {
      /* Client may already be closed. */
    }
  }
}
