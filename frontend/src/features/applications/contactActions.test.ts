import { describe, expect, it } from 'vitest'
import { contactLink } from './contactActions'

describe('contact actions', () => {
  it.each([
    ['+7 (900) 123-45-67', 'tel:+79001234567'],
    ['8 (900) 123-45-67', 'tel:+79001234567'],
    ['79001234567', 'tel:+79001234567'],
    ['+44 20 7946 0958', 'tel:+442079460958'],
    [' person+work@example.org ', 'mailto:person%2Bwork@example.org'],
    ['https://max.ru/u/test-user', 'https://max.ru/u/test-user'],
  ])('recognizes the complete contact %s', (value, href) => {
    expect(contactLink(value)?.href).toBe(href)
  })
  it.each([
    '',
    '@candidate',
    '9001234567',
    '12345',
    '123456789012345678',
    'Позвонить: +7 900 123-45-67',
    '+7 900 123-45-67 доб. 12',
    'user@example.org?subject=Hello',
    'user@example.org\r\nBcc:other@example.org',
    'javascript:alert(1)',
    'https://max.ru.evil.test/user',
    'https://max.ru@evil.test/user',
    'https://max.ru\\@evil.test/user',
    'https://max.ru/',
    'https://example.org/user',
    'https://max.ru/user текст',
    'https://max.ru/\nuser',
  ])('leaves ambiguous or unsupported text copy-only: %s', (value) => {
    expect(contactLink(value)).toBeUndefined()
  })
})
