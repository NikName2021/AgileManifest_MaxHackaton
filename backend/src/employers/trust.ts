import { Prisma } from '@prisma/client';
import { db } from '../db.js';
import { config } from '../config.js';

// «Надёжный работодатель»: отметку нельзя поставить себе самому. Засчитывается только найм,
// который подтвердил сам кандидат кнопкой «Приду» на выход на смену (attendance = confirmed),
// причём кандидат — реальный пользователь с личным чатом с ботом и не сам работодатель.
// Считаются разные люди, а не записи, и нужны наймы хотя бы на двух разных вакансиях.
export const TRUST_MIN_VACANCIES = 2;

export interface EmployerTrust {
  trusted: boolean;
  confirmedHires: number;
}

const UNTRUSTED: EmployerTrust = { trusted: false, confirmedHires: 0 };

export async function employerTrustMap(employerUserIds: number[]): Promise<Map<number, EmployerTrust>> {
  const ids = [...new Set(employerUserIds)];
  const result = new Map<number, EmployerTrust>(ids.map((id) => [id, UNTRUSTED]));
  if (ids.length === 0) return result;

  const rows = await db.$queryRaw<{ employerUserId: number; confirmedHires: number; vacancies: number }[]>`
    SELECT v.employer_user_id AS "employerUserId",
           COUNT(DISTINCT a.candidate_user_id)::int AS "confirmedHires",
           COUNT(DISTINCT a.vacancy_id)::int AS "vacancies"
    FROM applications a
    JOIN vacancies v ON v.id = a.vacancy_id
    JOIN users u ON u.id = a.candidate_user_id
    WHERE v.employer_user_id IN (${Prisma.join(ids)})
      AND a.status = 'hired'
      AND a.attendance = 'confirmed'
      AND a.candidate_user_id <> v.employer_user_id
      AND u.dialog_chat_id IS NOT NULL
    GROUP BY v.employer_user_id`;

  for (const row of rows) {
    result.set(row.employerUserId, {
      confirmedHires: row.confirmedHires,
      trusted: row.confirmedHires >= config.trustedEmployerMinHires && row.vacancies >= TRUST_MIN_VACANCIES,
    });
  }
  return result;
}

export async function employerTrust(employerUserId: number): Promise<EmployerTrust> {
  return (await employerTrustMap([employerUserId])).get(employerUserId) ?? UNTRUSTED;
}
