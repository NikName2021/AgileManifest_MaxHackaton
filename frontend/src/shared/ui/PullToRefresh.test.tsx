import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createResourceClient } from '../api/resourceClient'
import { useResource } from '../api/useResource'
import { PullToRefresh } from './PullToRefresh'

function Frame({ load }: { load: (signal: AbortSignal) => Promise<string> }) {
  const target = useRef<HTMLElement>(null)
  const { result } = useResource(load, 'screen')
  return (
    <main ref={target}>
      <PullToRefresh target={target} />
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

describe('pull to refresh', () => {
  it('refreshes at the top without clearing visible data and reports failure', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce('Данные')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('Новые данные')
    const view = start(load)
    await screen.findByText('Данные')
    pull(screen.getByRole('heading'))
    expect(screen.getByText('Данные')).toBeInTheDocument()
    await screen.findByText(/Не удалось обновить данные/)
    fireEvent.click(screen.getByRole('button', { name: 'Обновить данные' }))
    await screen.findByText('Новые данные')
    await screen.findByText('Данные обновлены')
    view.unmount()
    view.client.clear()
  })

  it('ignores short, horizontal, cancelled, input, modal and non-top gestures', async () => {
    const load = vi.fn().mockResolvedValue('Данные')
    const view = start(load)
    await screen.findByText('Данные')
    const heading = screen.getByRole('heading')
    pull(heading, 20, 60)
    pull(heading, 250, 100)
    pull(heading, 20, 190, true)
    pull(screen.getByRole('textbox'))
    const form = document.createElement('form')
    form.dataset.refreshLock = 'true'
    screen.getByRole('main').append(form)
    pull(heading)
    expect(screen.getByText('Сохраните изменения перед обновлением данных.')).toBeInTheDocument()
    form.remove()
    vi.stubGlobal('scrollY', 100)
    pull(heading)
    vi.stubGlobal('scrollY', 0)
    const dialog = document.createElement('dialog')
    dialog.open = true
    document.body.append(dialog)
    pull(heading)
    dialog.remove()
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    view.unmount()
    view.client.clear()
  })
})
