import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SessionContext } from '../session/context'
import { createPreviewSession } from '../../mocks/session'
import { BadgePicker } from './BadgePicker'
import { displayedBadges, parseBadgeCatalog } from './api'
import { previewBadgeCatalog } from '../../mocks/badges'
import { formValues, validateForm } from '../vacancies/model'

describe('vacancy benefits', () => {
  it('keeps students out of the picker and counts only selected benefits', async () => {
    function Form() {
      const [keys, setKeys] = useState(
        previewBadgeCatalog.groups
          .flatMap((g) => g.items)
          .filter((b) => !['students_ok', 'pay_weekly'].includes(b.key))
          .slice(0, 9)
          .map((b) => b.key)
          .join(','),
      )
      return (
        <SessionContext value={createPreviewSession()}>
          <BadgePicker
            value={keys}
            onChange={(next) => {
              setKeys(next.join(','))
            }}
          />
        </SessionContext>
      )
    }
    render(<Form />)
    const another = await screen.findByRole('button', { name: /Выплаты раз в неделю/ })
    expect(screen.queryByRole('button', { name: /Подходит студентам/ })).not.toBeInTheDocument()
    expect(screen.getByText('9 / 10')).toBeInTheDocument()
    expect(another).toBeEnabled()
    fireEvent.click(another)
    expect(screen.getByText('10 / 10')).toBeInTheDocument()
    fireEvent.click(another)
    expect(screen.getByText('9 / 10')).toBeInTheDocument()
  })
  it('preserves keys on edit/copy, deduplicates students and submits an empty list on removal', () => {
    const catalog = parseBadgeCatalog(previewBadgeCatalog)
    const items = catalog.groups
      .flatMap((g) => g.items)
      .filter((b) => ['housing_free', 'students_ok'].includes(b.key))
    expect(displayedBadges(items, true)).toHaveLength(2)
    const base = {
      ...formValues(),
      title: 'Повар',
      student_friendly: 'yes',
      badges: 'housing_free,students_ok',
    }
    expect(validateForm(base).input).toMatchObject({
      badges: ['housing_free'],
      student_friendly: true,
    })
    const ten = catalog.groups
      .flatMap((g) => g.items)
      .filter((b) => b.key !== 'students_ok')
      .slice(0, 10)
      .map((b) => b.key)
      .join(',')
    expect(validateForm({ ...base, category: 'Общепит', badges: ten }).errors).toEqual({})
    const legacy = formValues({ studentFriendly: false, badges: items } as Parameters<
      typeof formValues
    >[0])
    expect(legacy.student_friendly).toBe('yes')
    expect(legacy.badges).toBe('housing_free')
    expect(validateForm({ ...legacy, title: 'Повар', student_friendly: '' }).input).toMatchObject({
      badges: ['housing_free'],
      student_friendly: false,
    })
    expect(
      validateForm({
        ...base,
        badges: previewBadgeCatalog.groups
          .flatMap((g) => g.items)
          .slice(0, 11)
          .map((b) => b.key)
          .join(','),
      }).errors.badges,
    ).toBeTruthy()
    expect(validateForm({ ...base, badges: '', student_friendly: '' }).input).toMatchObject({
      badges: [],
      student_friendly: false,
    })
    expect(() =>
      parseBadgeCatalog({
        ...catalog,
        groups: [{ ...catalog.groups[0], items: [items[0], items[0]] }],
      }),
    ).toThrow()
  })
})
