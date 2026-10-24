import { describe, expect, it } from 'vitest';
import { BADGE_KEYS } from '../src/vacancies/badges.js';
import { createVacancySchema, updateVacancySchema, checkMergedVacancyConstraints } from '../src/validation.js';

describe('independent student flag', () => {
  const badges = BADGE_KEYS.filter(key => key !== 'students_ok').slice(0, 10);
  it('accepts ten benefits with student flag on or off, including merged PATCH', () => {
    for (const student_friendly of [true, false]) {
      expect(createVacancySchema.safeParse({ title: 'Повар', badges, student_friendly }).success).toBe(true);
      expect(updateVacancySchema.safeParse({ student_friendly }).success).toBe(true);
      expect(checkMergedVacancyConstraints({ title: 'Повар', badges, student_friendly })).toEqual({ ok: true });
    }
  });
  it('still rejects more than ten benefits', () => {
    const tooMany = BADGE_KEYS.filter(key => key !== 'students_ok').slice(0, 11);
    expect(createVacancySchema.safeParse({ title: 'Повар', badges: tooMany, student_friendly: false }).success).toBe(false);
    expect(checkMergedVacancyConstraints({ title: 'Повар', badges: tooMany }).ok).toBe(false);
  });
});
