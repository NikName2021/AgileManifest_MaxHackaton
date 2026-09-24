import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { MaxUI } from '@maxhub/max-ui'
import { ThemeContext, type ThemePreference } from './context'

const query = '(prefers-color-scheme: dark)'
function subscribe(callback: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem('season.theme')
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference)
  const systemDark = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
  const colorScheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
  function changePreference(value: ThemePreference) {
    setPreference(value)
    try {
      localStorage.setItem('season.theme', value)
    } catch {
      /* Theme still works without storage. */
    }
  }
  return (
    <ThemeContext value={{ preference, setPreference: changePreference }}>
      <div className="theme-root" data-theme={colorScheme}>
        <MaxUI colorScheme={colorScheme} className="max-root">
          {children}
        </MaxUI>
      </div>
    </ThemeContext>
  )
}
