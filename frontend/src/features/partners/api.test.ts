import { expect, it } from 'vitest'
import { parseChannel } from './api'
import { jobQuery } from '../candidate/query'
import { formValues, validateForm } from '../vacancies/model'

it('keeps inactive and removed channels distinguishable', () => {
  const c = {
    id: 1,
    title: null,
    isChannel: true,
    active: false,
    region: null,
    studentOnly: true,
    removed: true,
    createdAt: '2026-10-20T00:00:00Z',
  }
  expect(parseChannel(c)).toEqual(c)
  expect(() => parseChannel({ ...c, active: 'true' })).toThrow()
})
it('maps the student filter and vacancy flag to the backend contract', () => {
  expect(jobQuery(new URLSearchParams('student_friendly=true')).query.student_friendly).toBe(true)
  expect(
    jobQuery(new URLSearchParams('student_friendly=false')).query.student_friendly,
  ).toBeUndefined()
  expect(
    validateForm({ ...formValues(), title: 'Сбор урожая', student_friendly: 'yes' }).input
      .student_friendly,
  ).toBe(true)
})
