// Explicit CLI fixture setup. Not an HTTP endpoint and never run on application startup.
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

if (process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error('Set ALLOW_DEMO_SEED=true explicitly; use a separate test database.');
}

// Use the application's session implementation, not a second authentication mechanism.
const { issueSessionToken } = await import('../dist/auth/session.js');
const db = new PrismaClient();
try {
  const runId = randomUUID();
  const data = await db.$transaction(async (tx) => {
    const employer = await tx.user.create({ data: {
      maxUserId: `demo:${runId}:employer`, chatId: '', displayName: 'Демо: работодатель',
    } });
    const candidate = await tx.user.create({ data: {
      maxUserId: `demo:${runId}:candidate`, chatId: '', displayName: 'Демо: кандидат',
    } });
    const published = await tx.vacancy.create({ data: {
      employerUserId: employer.id,
      title: `ДЕМО: сборщик урожая (${runId})`,
      regionCode: 'Демонстрационный регион', category: 'Синтетические данные',
      schedule: 'seasonal', salaryMin: 40000, salaryMax: 60000,
      description: 'Синтетическая вакансия для проверки API. В MAX не публиковалась.',
      contactInfo: 'demo-employer@example.invalid', status: 'published',
      // No MAX chat IDs or fake card IDs. Disable reminder delivery for this fixture.
      reminderSentAt: new Date(),
    } });
    return { employer, candidate, published };
  });
  console.log(JSON.stringify({
    synthetic: true, run_id: runId,
    employer: { user_id: data.employer.id, token: issueSessionToken(data.employer.id) },
    candidate: { user_id: data.candidate.id, token: issueSessionToken(data.candidate.id) },
    published_vacancy_id: data.published.id,
  }, null, 2));
} finally {
  await db.$disconnect();
}
