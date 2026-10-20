import { expect, it } from 'vitest'
import { parseInviteResult, parseTeam } from './api'

it('keeps partial delivery results without treating them as full success', () => {
  const body = { sent: 1, results: [{ candidateId: 1, outcome: 'sent' }, { candidateId: 2, outcome: 'no_bot_chat' }] }
  expect(parseInviteResult(body)).toEqual(body)
  expect(() => parseInviteResult({ ...body, sent: 2 })).toThrow()
  expect(() => parseInviteResult({ sent: 0, results: [{ candidateId: 2, outcome: 'constructor' }] })).toThrow()
})
it('validates team membership and reliability flags', () => {
  const member = { candidate: { id: 3, displayName: 'Иван' }, contact: null, hiredCount: 2,
    lastHiredAt: null, lastVacancy: { id: 1, title: 'Сбор урожая' }, reliable: true, hasBotChat: false }
  expect(parseTeam({ items: [member], total: 1 })).toEqual([member])
  expect(() => parseTeam({ items: [{ ...member, reliable: 'yes' }], total: 1 })).toThrow()
})
