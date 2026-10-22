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
