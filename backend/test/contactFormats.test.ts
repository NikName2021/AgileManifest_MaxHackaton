import { describe, expect, it } from 'vitest';
import { normalizeContact, normalizeContactList } from '../src/moderation.js';
import { createVacancySchema, updateVacancySchema, createApplicationSchema, updateMeSchema } from '../src/validation.js';

describe('phone and MAX contact policy', () => {
  const schemas = (contact: string) => [
    createVacancySchema.safeParse({ title: 'Повар', contact_info: contact }),
    updateVacancySchema.safeParse({ contact_info: contact }),
    createApplicationSchema.safeParse({ vacancy_id: 1, contact }),
    updateMeSchema.safeParse({ application_contact: contact }),
  ];
  it.each(['t.me/ivan', 'https://t.me/ivan', 'https://telegram.me/ivan', 'tg://resolve?domain=ivan', 'ivan@mail.ru', 'https://vk.com/ivan', 'https://wa.me/79001234567', 'https://max.ru.evil.test/ivan', 'https://max.ru@t.me/ivan'])('rejects %s in API schemas and bot normalizer', (contact) => {
    expect(schemas(contact).every(result => !result.success)).toBe(true);
    expect(normalizeContact(contact)).toBeNull();
    expect(normalizeContactList(`@ivan_max, ${contact}`)).toBeNull();
  });
  it.each(['+7 900 123-45-67', '89001234567', '+375291234567', '@ivan_max', 'max.ru/u/ivan', 'https://web.max.ru/ivan'])('accepts %s', (contact) => {
    expect(schemas(contact).every(result => result.success)).toBe(true);
  });
  it('allows clearing contacts and mixed phone/MAX employer contacts', () => {
    expect(updateMeSchema.safeParse({ application_contact: null }).success).toBe(true);
    expect(updateVacancySchema.safeParse({ contact_info: '' }).success).toBe(true);
    expect(createVacancySchema.parse({ title: 'Повар', contact_info: '89001234567, @ivan_max' }).contact_info).toBe('+7 900 123-45-67, @ivan_max');
  });
});
