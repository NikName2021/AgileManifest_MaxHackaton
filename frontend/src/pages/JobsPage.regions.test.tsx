import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { JobsPage } from './JobsPage'
import { SessionContext } from '../features/session/context'
import { createPreviewSession } from '../mocks/session'
import { createResourceClient } from '../shared/api/resourceClient'
import * as regions from '../shared/api/regions'
import { ApiError } from '../shared/api/client'

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute('open', '')
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute('open')
      },
    },
  })
})

it('offers the region directory even when there are no published vacancies', async () => {
  const session = createPreviewSession()
  vi.spyOn(session.candidate, 'jobs').mockResolvedValue({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
  })
  const filters = vi
    .spyOn(session.candidate, 'filters')
    .mockResolvedValue({ regions: [], categories: [] })
  const client = createResourceClient()
  const view = render(
    <QueryClientProvider client={client}>
      <SessionContext value={session}>
        <MemoryRouter>
          <JobsPage />
        </MemoryRouter>
      </SessionContext>
    </QueryClientProvider>,
  )
  await screen.findByText('Пока нет подходящих вакансий')
  fireEvent.click(screen.getByRole('combobox', { name: 'Регион' }))
  expect(await screen.findByRole('radio', { name: 'Краснодарский край' })).toBeInTheDocument()
  expect(filters).not.toHaveBeenCalled()
  view.unmount()
  client.clear()
})

it('disables the region selector on error and offers a working retry', async () => {
  const request = vi
    .spyOn(regions, 'getRegions')
    .mockRejectedValueOnce(new ApiError('network'))
    .mockResolvedValueOnce([{ code: '23', name: 'Краснодарский край' }])
  const session = createPreviewSession(),
    client = createResourceClient()
  const view = render(
    <QueryClientProvider client={client}>
      <SessionContext value={session}>
        <MemoryRouter>
          <JobsPage />
        </MemoryRouter>
      </SessionContext>
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Загрузить регионы' }))
  await screen.findByRole('combobox', { name: 'Регион' })
  // Wait for the successful retry before opening the picker.

  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Регион' })).toBeEnabled())
  fireEvent.click(screen.getByRole('combobox', { name: 'Регион' }))
  expect(await screen.findByRole('radio', { name: 'Краснодарский край' })).toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(2)
  view.unmount()
  client.clear()
  request.mockRestore()
})
