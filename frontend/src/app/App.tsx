import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Component, type ReactNode } from 'react'
import { AppearanceProvider } from '../features/appearance/AppearanceProvider'
import { SessionGate } from '../features/session/SessionGate'
import { Shell } from './Shell'
import { OverviewPage } from '../pages/OverviewPage'
import { WorkspacePage } from '../pages/WorkspacePage'
import { GuidePage } from '../pages/GuidePage'
import { SettingsPage } from '../pages/SettingsPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { VacanciesPage } from '../pages/VacanciesPage'
import { VacancyFormPage } from '../pages/VacancyFormPage'
import { VacancyPage } from '../pages/VacancyPage'
import '../features/vacancies/vacancies.css'

const router = createBrowserRouter([
  {
    element: (
      <SessionGate>
        <Shell />
      </SessionGate>
    ),
    errorElement: (
      <main className="fatal-error">
        <h1>Не удалось открыть страницу</h1>
        <p>Обновите приложение, чтобы попробовать снова.</p>
        <button onClick={() => window.location.reload()}>Обновить</button>
      </main>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'vacancies', element: <VacanciesPage /> },
      { path: 'vacancies/new', element: <VacancyFormPage /> },
      { path: 'vacancies/:id', element: <VacancyPage /> },
      { path: 'vacancies/:id/edit', element: <VacancyFormPage /> },
      { path: 'applications', element: <WorkspacePage section="applications" /> },
      { path: 'guide', element: <GuidePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

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
        <RouterProvider router={router} />
      </AppearanceProvider>
    </ErrorBoundary>
  )
}
