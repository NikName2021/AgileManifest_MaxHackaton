import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Select } from './Select'

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
const options = (
  <>
    <option value="seasonal">Сезонная работа</option>
    <option value="shift">По сменам</option>
    <option value="closed" disabled>
      Недоступно
    </option>
  </>
)

describe('MAX UI select picker', () => {
  it('updates controlled state through a change event and preserves FormData', () => {
    const change = vi.fn()
    function Form() {
      const [value, setValue] = useState('seasonal')
      return (
        <form aria-label="Вакансия">
          <Select
            label="Занятость"
            name="schedule"
            value={value}
            onChange={(e) => {
              change(e.target.value)
              setValue(e.target.value)
            }}
          >
            {options}
          </Select>
        </form>
      )
    }
    render(<Form />)
    const button = screen.getByRole('combobox', { name: 'Занятость' })
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(screen.getByRole('radio', { name: 'Недоступно' })).toBeDisabled()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('radio', { name: 'По сменам' }))
    expect(change).toHaveBeenCalledExactlyOnceWith('shift')
    expect(button).toHaveTextContent('По сменам')
    expect(new FormData(screen.getByRole('form') as HTMLFormElement).get('schedule')).toBe('shift')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })
  it('restores the default on form reset and does not select on Escape', () => {
    render(
      <form aria-label="Вакансия">
        <Select label="Занятость" defaultValue="seasonal">
          {options}
        </Select>
      </form>,
    )
    const button = screen.getByRole('combobox')
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('radio', { name: 'По сменам' }))
    fireEvent.reset(screen.getByRole('form'))
    expect(button).toHaveTextContent('Сезонная работа')
    fireEvent.click(button)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveTextContent('Сезонная работа')
    expect(button).toHaveFocus()
  })
  it('searches long lists and exposes an empty result without changing the value', () => {
    render(
      <Select label="Регион" defaultValue="0">
        {Array.from({ length: 10 }, (_, index) => (
          <option key={index} value={String(index)}>
            Регион {index}
          </option>
        ))}
      </Select>,
    )
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск: Регион' }), {
      target: { value: 'Регион 8' },
    })
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Москва' } })
    expect(screen.getByRole('status')).toHaveTextContent('Ничего не найдено')
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть выбор: Регион' }))
    expect(screen.getByRole('combobox')).toHaveTextContent('Регион 0')
  })
  it('honours a disabled fieldset and excludes it from submission', () => {
    render(
      <form aria-label="Вакансия">
        <fieldset disabled>
          <Select label="Занятость" name="schedule">
            {options}
          </Select>
        </fieldset>
      </form>,
    )
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(new FormData(screen.getByRole('form') as HTMLFormElement).has('schedule')).toBe(false)
  })
})
