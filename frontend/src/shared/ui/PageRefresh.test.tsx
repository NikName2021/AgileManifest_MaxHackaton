import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createResourceClient } from '../api/resourceClient'
import { useResource } from '../api/useResource'
import { PageRefresh } from './PageRefresh'

function Frame({ load }: { load: (signal: AbortSignal) => Promise<string> }) {
  const { result } = useResource(load, 'screen')
  return (
    <main>
      <PageRefresh />
      <h1>Экран</h1>
      <input aria-label="Поле" />
      {result.state === 'ready' && <p>{result.data}</p>}
    </main>
  )
}
function start(load: (signal: AbortSignal) => Promise<string>) {
  const client = createResourceClient()
  const view = render(
    <QueryClientProvider client={client}>
      <Frame load={load} />
    </QueryClientProvider>,
  )
  return { ...view, client }
}
function pull(target: Element, x = 20, y = 190, cancel = false) {
  fireEvent.touchStart(target, { touches: [{ clientX: 20, clientY: 0 }] })
  fireEvent.touchMove(target, { touches: [{ clientX: x, clientY: y }] })
  if (cancel) fireEvent.touchCancel(target)
  else fireEvent.touchEnd(target, { touches: [] })
}

describe('page refresh', () => {
  it('shows the indicator only while a button-triggered refresh is pending', async () => {
    let finish!: (data: string) => void
    const load = vi
      .fn()
      .mockResolvedValueOnce('Данные')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve
          }),
      )
    const view = start(load)
    await screen.findByText('Данные')
    pull(screen.getByRole('heading'))
    expect(screen.queryByText('Обновляем…')).not.toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
    const button = screen.getByRole('button', { name: 'Обновить данные' })
    fireEvent.click(button)
    expect(screen.getByText('Обновляем…')).toBeInTheDocument()
    expect(button).toBeDisabled()
    finish('Новые данные')
    await screen.findByText('Данные обновлены')
    expect(screen.queryByText('Обновляем…')).not.toBeInTheDocument()
    expect(button).toBeEnabled()
    view.unmount()
    view.client.clear()
  })

  it('refreshes on click without clearing visible data and reports failure', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce('Данные')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('Новые данные')
    const view = start(load)
    await screen.findByText('Данные')
    fireEvent.click(screen.getByRole('button', { name: 'Обновить данные' }))
    expect(screen.getByText('Данные')).toBeInTheDocument()
    await screen.findByText(/Не удалось обновить данные/)
    fireEvent.click(screen.getByRole('button', { name: 'Обновить данные' }))
    await screen.findByText('Новые данные')
    await screen.findByText('Данные обновлены')
    view.unmount()
    view.client.clear()
  })

  it('ignores pull gestures and preserves unsaved edits when refresh is clicked', async () => {
    const load = vi.fn().mockResolvedValue('Данные')
    const view = start(load)
    await screen.findByText('Данные')
    const heading = screen.getByRole('heading')
    pull(heading, 20, 60)
    pull(heading, 250, 100)
    pull(heading, 20, 190, true)
    pull(screen.getByRole('textbox'))
    pull(heading)
    expect(screen.queryByText(/Отпустите для обновления|Потяните вниз/)).not.toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
    const form = document.createElement('form')
    form.dataset.refreshLock = 'true'
    screen.getByRole('main').append(form)
    fireEvent.click(screen.getByRole('button', { name: 'Обновить данные' }))
    expect(screen.getByText('Сохраните изменения перед обновлением данных.')).toBeInTheDocument()
    form.remove()
    expect(load).toHaveBeenCalledTimes(1)
    view.unmount()
    view.client.clear()
  })
})
