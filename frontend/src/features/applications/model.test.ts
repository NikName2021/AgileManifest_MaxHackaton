import { describe, expect, it } from 'vitest'
import { candidateContact, candidateName, parsePositiveInteger, statusNotice } from './model'
import type { Application, ApplicationStatus } from '../../entities/hiring'

const application: Application = {
  id: 1,
  vacancyId: 2,
  candidateUserId: 3,
  status: 'new',
  contact: null,
  createdAt: '2026-09-26T10:00:00Z',
  updatedAt: '2026-09-26T10:00:00Z',
  candidate: { id: 3, displayName: null, phone: null },
  vacancy: { id: 2, title: 'Повар', status: 'published' },
}
describe('candidate data and notification semantics', () => {
  it('uses safe fallbacks for absent name/contact and prefers explicitly supplied contact', () => {
    expect(candidateName(application)).toBe('Кандидат № 3')
    expect(candidateContact(application)).toBe('')
    const phoneOnly = {
      ...application,
      candidate: { ...application.candidate, phone: ' +7 000 000-00-00 ' },
    }
    expect(candidateContact(phoneOnly)).toBe('+7 000 000-00-00')
    expect(candidateContact({ ...phoneOnly, contact: 'Напишите в MAX' })).toBe('Напишите в MAX')
  })
  it.each<ApplicationStatus>(['new', 'contacted'])(
    'does not treat notified=false as failure for %s',
    (status) => {
      expect(
        statusNotice(
          { application: { ...application, status }, notified: false, unchanged: false },
          false,
        ),
      ).toMatchObject({ tone: 'success' })
    },
  )
  it.each<ApplicationStatus>(['invited', 'hired', 'rejected'])(
    'warns about notification failure while preserving saved %s',
    (status) => {
      const notice = statusNotice(
        { application: { ...application, status }, notified: false, unchanged: false },
        false,
      )
      expect(notice.tone).toBe('warning')
      expect(notice.text).toContain('сохранён. Уведомление не отправлено.')
    },
  )
  it('distinguishes unchanged, notified and demo results', () => {
    const result = {
      application: { ...application, status: 'invited' as const },
      notified: false,
      unchanged: true,
    }
    expect(statusNotice(result, false)).toMatchObject({
      tone: 'neutral',
      text: expect.stringContaining('Повторное уведомление не отправлялось'),
    })
    expect(statusNotice({ ...result, unchanged: false, notified: true }, false).text).toContain(
      'Уведомление отправлено в MAX',
    )
    expect(statusNotice({ ...result, unchanged: false }, true).text).toContain('Это демо')
  })
  it('rejects invalid deep-link identifiers without coercing partial numbers', () => {
    for (const value of [null, '', '-1', '1x', '1.5', '1e3', '9007199254740992'])
      expect(parsePositiveInteger(value)).toBeUndefined()
    expect(parsePositiveInteger('42')).toBe(42)
  })
})
