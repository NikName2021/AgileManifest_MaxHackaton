import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Component, type ReactNode } from 'react'
import { AppearanceProvider } from '../features/appearance/AppearanceProvider'
import { SessionGate } from '../features/session/SessionGate'
import { Shell } from './Shell'
import { OverviewPage } from '../pages/OverviewPage'
import { WorkspacePage } from '../pages/WorkspacePage'
import { GuidePage } from '../pages/GuidePage'
import { SettingsPage } from '../pages/SettingsPage'
import { NotFoundPage } from '../pages/NotFoundPage'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error">
          <h1>Не удалось открыть страницу</h1>
          <p>Обновите приложение, чтобы попробовать снова.</p>
          <button onClick={() => window.location.reload()}>Обновить</button>
        </main>
      )
    return this.props.children
  }
}
export function App() {
  return (
    <ErrorBoundary>
      <AppearanceProvider>
        <BrowserRouter>
          <SessionGate>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<OverviewPage />} />
                <Route path="vacancies" element={<WorkspacePage section="vacancies" />} />
                <Route path="applications" element={<WorkspacePage section="applications" />} />
                <Route path="guide" element={<GuidePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </SessionGate>
        </BrowserRouter>
      </AppearanceProvider>
    </ErrorBoundary>
  )
}
