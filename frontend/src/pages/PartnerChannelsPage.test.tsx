import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SessionContext } from '../features/session/context'
import { createPreviewSession } from '../mocks/session'
import { ApiError } from '../shared/api/client'
import { PartnerChannelsPage } from './PartnerChannelsPage'

function renderPage(session = createPreviewSession()) {
  render(
    <MemoryRouter>
      <SessionContext value={session}>
        <PartnerChannelsPage />
      </SessionContext>
    </MemoryRouter>,
  )
}

describe('partner autopublication', () => {
  it('checks again despite fresh cache, shows progress and displays newly connected channels', async () => {
    const session = createPreviewSession()
    const channels = await session.partners!.list()
    let finish!: (value: typeof channels) => void
    const list = vi
      .spyOn(session.partners!, 'list')
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
    renderPage(session)
    await screen.findByText('Каналы ещё не подключены')
    fireEvent.click(screen.getByRole('button', { name: 'Проверить подключение каналов' }))
    expect(screen.getByRole('button', { name: 'Проверяем подключение…' })).toBeDisabled()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await act(async () => finish(channels))
    expect(
      await screen.findByText('Проверка завершена. Подключённых каналов и чатов: 1.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('switch', { name: 'Автопубликация в канал' }),
    ).toBeInTheDocument()
  })

  it('explains an empty connection check next to the button', async () => {
    const session = createPreviewSession()
    vi.spyOn(session.partners!, 'list').mockResolvedValue([])
    renderPage(session)
    await screen.findByText('Каналы ещё не подключены')
    fireEvent.click(screen.getByRole('button', { name: 'Проверить подключение каналов' }))
    expect(await screen.findByText(/Подключённые каналы пока не найдены/)).toBeInTheDocument()
  })

  it('shows refresh failures with cached channels and allows a successful retry', async () => {
    const session = createPreviewSession()
    const channels = await session.partners!.list()
    const list = vi
      .spyOn(session.partners!, 'list')
      .mockResolvedValueOnce(channels)
      .mockRejectedValueOnce(new ApiError('network'))
      .mockResolvedValue(channels)
    renderPage(session)
    await screen.findByRole('switch', { name: 'Автопубликация в канал' })
    fireEvent.click(screen.getByRole('button', { name: 'Проверить подключение каналов' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось связаться с сервисом')
    expect(screen.getByRole('switch', { name: 'Автопубликация в канал' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Проверить подключение каналов' }))
    expect(
      await screen.findByText('Проверка завершена. Подключённых каналов и чатов: 1.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('keeps the switch available while paused and persists both transitions with filters', async () => {
    const session = createPreviewSession()
    const update = vi.spyOn(session.partners!, 'update')
    renderPage(session)
    const toggle = await screen.findByRole('switch', { name: 'Автопубликация в канал' })
    const configure = screen.getByRole('button', { name: 'Настроить' })
    expect(toggle).toBeEnabled()
    expect(toggle).not.toBeChecked()
    expect(configure).toBeDisabled()
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())
    expect(configure).toBeEnabled()
    expect(update).toHaveBeenLastCalledWith(1, { active: true })
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(toggle).toBeEnabled()
    expect(configure).toBeDisabled()
    expect(update).toHaveBeenLastCalledWith(1, { active: false })
    expect((await session.partners!.list())[0].studentOnly).toBe(true)
    expect((await session.partners!.list())[0].active).toBe(false)
  })

  it('keeps the confirmed state if saving fails and locks the switch during the request', async () => {
    const session = createPreviewSession()
    let fail!: (reason: unknown) => void
    vi.spyOn(session.partners!, 'update').mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject
        }),
    )
    renderPage(session)
    const toggle = await screen.findByRole('switch', { name: 'Автопубликация в канал' })
    fireEvent.click(toggle)
    expect(toggle).toBeDisabled()
    await act(async () => {
      fail(new ApiError('network'))
    })
    expect(toggle).not.toBeChecked()
    expect(toggle).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Настроить' })).toBeDisabled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
