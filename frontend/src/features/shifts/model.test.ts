import { describe, expect, it } from 'vitest'
import { parseShift, shiftDate, shiftInput } from './model'

describe('shift scheduling', () => {
  it('uses Moscow independently of the browser timezone', () => {
    expect(shiftDate('2030-06-01T09:00', 0)).toBe('2030-06-01T06:00:00.000Z')
    expect(shiftInput('2030-06-01T06:00:00Z')).toBe('2030-06-01T09:00')
  })
  it('rejects past and impossible dates', () => {
    expect(() => shiftDate('2020-01-01T09:00')).toThrow()
    expect(() => shiftDate('2030-02-30T09:00', 0)).toThrow()
  })
  it('validates confirmation data and retains absence for old responses', () => {
    expect(parseShift({ attendance: 'confirmed', startAt: null }).attendance).toBe('confirmed')
    expect(() => parseShift({ attendance: 'yes' })).toThrow()
    expect(() => parseShift({ startAt: 'invalid' })).toThrow()
  })
})
