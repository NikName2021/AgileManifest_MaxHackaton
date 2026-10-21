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
  it('counts students in the four-item limit and releases a slot when deselected', async () => {
    function Form() {
      const [keys, setKeys] = useState('housing_free,meals_3,tickets_paid')
      const [student, setStudent] = useState(true)
      return (
        <SessionContext value={createPreviewSession()}>
          <BadgePicker
            value={keys}
            studentFriendly={student}
            onChange={(next, flag) => {
              setKeys(next.join(','))
              setStudent(flag)
            }}
          />
        </SessionContext>
      )
    }
    render(<Form />)
    const students = await screen.findByRole('button', { name: /Подходит студентам/ })
    expect(students).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('4 / 4')).toBeInTheDocument()
    const another = screen.getByRole('button', { name: /Выплаты раз в неделю/ })
    expect(another).toBeDisabled()
    fireEvent.click(students)
    expect(another).toBeEnabled()
    fireEvent.click(another)
    expect(screen.getByText('4 / 4')).toBeInTheDocument()
    expect(students).toBeDisabled()
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
      badges: ['housing_free', 'students_ok'],
      student_friendly: true,
    })
    expect(
      validateForm({ ...base, badges: 'housing_free,meals_3,tickets_paid,pay_weekly' }).errors
        .badges,
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
