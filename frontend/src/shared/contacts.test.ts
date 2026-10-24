import { describe, expect, it } from 'vitest'
import { normalizeContact, normalizeContactList } from './contacts'
import { formValues, validateForm } from '../features/vacancies/model'

describe('phone and MAX contacts', () => {
  it.each([
    't.me/ivan',
    'https://t.me/ivan',
    'https://telegram.me/ivan',
    'tg://resolve?domain=ivan',
    'ivan@mail.ru',
    'https://vk.com/ivan',
    'https://wa.me/79001234567',
    'https://max.ru.evil.test/ivan',
    'https://max.ru@t.me/ivan',
  ])('rejects %s in worker and employer contacts', (value) => {
    expect(normalizeContact(value)).toBeNull()
    expect(normalizeContactList(`@ivan_max, ${value}`)).toBeNull()
    expect(
      validateForm({ ...formValues(), title: 'Повар', contact_info: value }).errors.contact_info,
    ).toBeTruthy()
  })
  it.each([
    '+7 900 123-45-67',
    '89001234567',
    '+375291234567',
    '@ivan_max',
    'max.ru/u/ivan',
    'https://web.max.ru/ivan',
  ])('accepts %s', (value) => {
    expect(normalizeContact(value)).not.toBeNull()
    expect(validateForm({ ...formValues(), title: 'Повар', contact_info: value }).errors).toEqual(
      {},
    )
  })
  it('keeps optional empty employer contact and up to three allowed contacts', () => {
    expect(validateForm({ ...formValues(), title: 'Повар' }).errors).toEqual({})
    expect(normalizeContactList('89001234567; @ivan_max или max.ru/u/ivan')).toBe(
      '+7 900 123-45-67, @ivan_max, https://max.ru/u/ivan',
    )
    expect(normalizeContactList('@one, @two, @three, @four')).toBeNull()
  })
})
