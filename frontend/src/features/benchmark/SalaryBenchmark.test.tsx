import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ButtonHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createPreviewSession } from '../../mocks/session'
import { SessionContext } from '../session/context'
import { SalaryBenchmark } from './SalaryBenchmark'
import type { SalaryBenchmarkData } from './api'

vi.mock('@maxhub/max-ui', () => ({
  Button: ({
    variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => {
    void variant
    return <button {...props} />
  },
}))
const data: SalaryBenchmarkData = {
  avgSalaryMin: 45000,
  avgSalaryMax: 65000,
  vacancyCount: 24,
  isFresh: true,
}
function setup(position = 'Повар', region = 'Тула') {
  const session = createPreviewSession()
  const get = vi.spyOn(session.benchmark, 'get')
  const view = (title: string, area: string) => (
    <SessionContext value={session}>
      <SalaryBenchmark position={title} region={area} />
    </SessionContext>
  )
  const rendered = render(view(position, region))
  return {
    get,
    session,
    unmount: rendered.unmount,
    change: (title: string, area: string) => rendered.rerender(view(title, area)),
  }
}
function request() {
  fireEvent.click(screen.getByRole('button', { name: 'Посмотреть ориентир' }))
}
describe('salary benchmark panel', () => {
  it('requires explicit action, labels demo data and never uses the network in preview', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { get } = setup()
    expect(get).not.toHaveBeenCalled()
    expect(screen.getByText(/фиксированный пример/)).toBeInTheDocument()
    request()
    await screen.findByText(/45\s000\s₽/)
    expect(get).toHaveBeenCalledWith({ position: 'Повар', region: 'Тула' }, expect.any(AbortSignal))
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.getByText(/без фильтра по региону/)).toBeInTheDocument()
    expect(screen.getByText(/Вакансий в выборке: 24/)).toBeInTheDocument()
  })
  it('requires both search fields but does not fetch on editing them', () => {
    const { get, change } = setup('', '')
    expect(screen.getByRole('button')).toBeDisabled()
    change('Повар', '')
    expect(screen.getByRole('button')).toBeDisabled()
    change('Повар', 'Тула')
    expect(screen.getByRole('button')).toBeEnabled()
    expect(get).not.toHaveBeenCalled()
  })
  it.each(['title', 'region'])(
    'cancels and ignores an old response after changing %s',
    async (field) => {
      const { get, change } = setup()
      let resolve!: (value: SalaryBenchmarkData) => void
      get.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      request()
      const oldSignal = get.mock.calls[0][1]
      expect(screen.getByRole('button')).toBeDisabled()
      fireEvent.click(screen.getByRole('button'))
      expect(get).toHaveBeenCalledOnce()
      change(field === 'title' ? 'Пекарь' : 'Повар', field === 'region' ? 'Москва' : 'Тула')
      expect(oldSignal?.aborted).toBe(true)
      await act(() => resolve({ ...data, avgSalaryMin: 99999 }))
      expect(screen.queryByText(/99\s999/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Посмотреть ориентир' })).toBeEnabled()
      request()
      await screen.findByText(/45\s000\s₽/)
      expect(get).toHaveBeenCalledTimes(2)
    },
  )
  it('clears a completed result when the query changes and cancels on unmount', async () => {
    const { get, change, unmount } = setup()
    request()
    await screen.findByText(/45\s000\s₽/)
    change('Пекарь', 'Тула')
    expect(screen.queryByText(/45\s000\s₽/)).not.toBeInTheDocument()
    get.mockImplementationOnce(() => new Promise(() => {}))
    request()
    const signal = get.mock.calls[1][1]
    unmount()
    expect(signal?.aborted).toBe(true)
  })
  it('distinguishes stale data and does not invent a date or reorder independent averages', async () => {
    const { get } = setup()
    get.mockResolvedValueOnce({ ...data, avgSalaryMin: 70000, avgSalaryMax: 50000, isFresh: false })
    request()
    await screen.findByText(/могли устареть/)
    const values = screen.getAllByRole('definition')
    expect(values[0]).toHaveTextContent(/70\s000\s₽/)
    expect(values[1]).toHaveTextContent(/50\s000\s₽/)
    expect(screen.getByText(/Границы усредняются отдельно/)).toBeInTheDocument()
  })
  it.each([
    { ...data, vacancyCount: 0, avgSalaryMin: null, avgSalaryMax: null },
    { ...data, avgSalaryMin: null, avgSalaryMax: null },
  ])('shows an honest empty state for %j', async (result) => {
    const { get } = setup()
    get.mockResolvedValueOnce(result)
    request()
    await screen.findByText(
      result.vacancyCount === 0 ? /В выборке нет вакансий/ : /данных о зарплате для расчёта нет/,
    )
    expect(screen.queryByText(/0\s₽/)).not.toBeInTheDocument()
  })
  it('keeps a missing bound distinct from a reported zero', async () => {
    const { get } = setup()
    get.mockResolvedValueOnce({ ...data, avgSalaryMin: null, avgSalaryMax: 0 })
    request()
    await screen.findByText('Нет данных')
    expect(screen.getByText(/0\s₽/)).toBeInTheDocument()
  })
  it('offers explicit retry after a failure without showing raw error details', async () => {
    const { get } = setup()
    get.mockRejectedValueOnce(new Error('private upstream error'))
    request()
    await screen.findByText(/Сейчас ориентир недоступен/)
    expect(screen.queryByText(/private/)).not.toBeInTheDocument()
    expect(get).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить запрос' }))
    await screen.findByText(/45\s000\s₽/)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
