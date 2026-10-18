import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppearanceProvider } from './AppearanceProvider'
import { useTheme } from './context'

function ThemePicker() {
  const { setPreference } = useTheme()
  return (
    <>
      <button onClick={() => setPreference('light')}>Light</button>
      <button onClick={() => setPreference('dark')}>Dark</button>
      <button onClick={() => setPreference('system')}>System</button>
    </>
  )
}

let systemDark = true
let listeners: Set<() => void>
beforeEach(() => {
  localStorage.removeItem('season.theme')
  systemDark = true
  listeners = new Set()
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return systemDark
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }))
})
afterEach(() => localStorage.removeItem('season.theme'))

function changeSystemTheme(dark: boolean) {
  act(() => {
    systemDark = dark
    listeners.forEach((listener) => listener())
  })
}

describe('document appearance', () => {
  it('keeps an explicit light theme on a dark device and after reopening', () => {
    const { unmount } = render(
      <AppearanceProvider>
        <ThemePicker />
      </AppearanceProvider>,
    )
    expect(document.documentElement).toHaveAttribute('data-app-theme', 'dark')
    fireEvent.click(screen.getByText('Light'))
    expect(document.documentElement).toHaveAttribute('data-app-theme', 'light')
    changeSystemTheme(false)
    changeSystemTheme(true)
    expect(document.documentElement).toHaveAttribute('data-app-theme', 'light')
    unmount()
    render(
      <AppearanceProvider>
        <ThemePicker />
      </AppearanceProvider>,
    )
    expect(document.documentElement).toHaveAttribute('data-app-theme', 'light')
  })

  it('tracks system changes only in system mode and restores the document on unmount', () => {
    const { unmount } = render(
      <AppearanceProvider>
        <ThemePicker />
      </AppearanceProvider>,
    )
    fireEvent.click(screen.getByText('Dark'))
    changeSystemTheme(false)
    expect(document.documentElement).toHaveAttribute('data-app-theme', 'dark')
    fireEvent.click(screen.getByText('System'))
    expect(document.documentElement).toHaveAttribute('data-app-theme', 'light')
    changeSystemTheme(true)
    expect(document.documentElement).toHaveAttribute('data-app-theme', 'dark')
    unmount()
    expect(document.documentElement).not.toHaveAttribute('data-app-theme')
  })
})
