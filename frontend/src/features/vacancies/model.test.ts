import { describe, expect, it } from 'vitest'
import { cardTextLength, formValues, formatSalary, validateForm } from './model'
import type { Vacancy } from '../../entities/hiring'

describe('vacancy form validation', () => {
  it('rejects a blank title, decimals, negative and overflowing salaries', () => {
    for (const value of ['-1', '1.5', '1e4', '2147483648', 'abc']) {
      expect(
        validateForm({ ...formValues(), title: ' ', salary_min: value }).errors,
      ).toHaveProperty('salary_min')
    }
    expect(validateForm(formValues()).errors.title).toBeTruthy()
  })
  it('trims text, normalizes spaces and sends null for an empty boundary', () => {
    const { input, errors } = validateForm({
      ...formValues(),
      title: ' Повар ',
      salary_min: '50 000',
      contact_info: ' Имя ',
    })
    expect(errors).toEqual({})
    expect(input).toMatchObject({
      title: 'Повар',
      salary_min: 50000,
      salary_max: null,
      contact_info: 'Имя',
      description: null,
    })
  })
  it('keeps zero and rejects inverted ranges and long contacts', () => {
    expect(
      validateForm({ ...formValues(), title: 'Повар', salary_min: '0' }).input.salary_min,
    ).toBe(0)
    expect(
      validateForm({
        ...formValues(),
        salary_min: '200',
        salary_max: '100',
        contact_info: 'a'.repeat(301),
      }).errors,
    ).toMatchObject({ salary_max: expect.any(String), contact_info: expect.any(String) })
  })
  it('formats one-sided salaries without inventing a period', () => {
    expect(formatSalary(null, null)).toBe('По договорённости')
    expect(formatSalary(0, null)).toBe('от 0 ₽')
    expect(formatSalary(null, 50000)).toMatch(/^до 50\s000 ₽$/)
    expect(formatSalary(50000, 50000)).toMatch(/^50\s000 ₽$/)
  })
  it('counts the complete escaped MAX card rather than just its description', () => {
    const v: Vacancy = {
      id: 1,
      title: 'Повар',
      regionCode: 'Тула',
      category: 'general',
      schedule: 'seasonal',
      salaryMin: null,
      salaryMax: null,
      description: 'я'.repeat(3950),
      contactInfo: 'Контакт',
      status: 'draft',
      cardMessageId: null,
      createdAt: '2026-09-26',
    }
    expect(cardTextLength(v)).toBeGreaterThan(4000)
    expect(cardTextLength({ ...v, description: '*'.repeat(2000) })).toBeGreaterThan(4000)
  })
})
