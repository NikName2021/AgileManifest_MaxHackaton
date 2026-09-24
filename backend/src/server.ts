import Fastify from 'fastify';
import { config } from './config.js';
import { maxApi } from './max/client.js';
import { registerMaxWebhook } from './max/webhook.js';
import { db } from './db.js';
import { publishVacancyCard } from './vacancies/publish.js';
import { getBenchmark } from './trudvsem/benchmarkService.js';

const app = Fastify({ logger: true });

registerMaxWebhook(app);

// Служебный healthcheck — пригодится и для Docker, и для проверки, что backend жив
app.get('/health', async () => ({ ok: true }));

// --- Собственный backend API (раздел 6 ТЗ) ---
// MVP-уровень авторизации: доверяем telegram/MAX-контекст, отдельного auth-слоя нет.
// TODO: перед публичной сдачей — минимальная проверка токена для мини-приложения (см. раздел 6 ТЗ).

app.get('/api/vacancies', async (request) => {
  const employerId = (request.query as any)?.employer_id;
  return db.vacancy.findMany({
    where: employerId ? { employerUserId: Number(employerId) } : undefined,
    orderBy: { createdAt: 'desc' },
  });
});

app.post('/api/vacancies', async (request, reply) => {
  const body = request.body as any;
  if (!body?.employer_id || !body?.title) {
    return reply.code(400).send({ error: 'employer_id and title are required' });
  }

  const vacancy = await db.vacancy.create({
    data: {
      employerUserId: Number(body.employer_id),
      title: body.title,
      regionCode: body.region_code ?? '',
      category: body.category ?? 'general',
      schedule: body.schedule ?? 'temporary',
      salaryMin: body.salary_min ?? null,
      salaryMax: body.salary_max ?? null,
      description: body.description ?? null,
      status: 'draft',
    },
  });

  return reply.code(201).send(vacancy);
});

app.get('/api/vacancies/:id', async (request, reply) => {
  const id = Number((request.params as any).id);
  const vacancy = await db.vacancy.findUnique({ where: { id } });
  if (!vacancy) return reply.code(404).send({ error: 'vacancy not found' });
  return vacancy;
});

app.post('/api/vacancies/:id/publish', async (request, reply) => {
  const id = Number((request.params as any).id);
  const existing = await db.vacancy.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'vacancy not found' });

  const vacancy = await db.vacancy.update({ where: { id }, data: { status: 'published' } });
  await publishVacancyCard(vacancy);
  return vacancy;
});

app.post('/api/vacancies/:id/close', async (request, reply) => {
  const id = Number((request.params as any).id);
  const existing = await db.vacancy.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'vacancy not found' });

  return db.vacancy.update({ where: { id }, data: { status: 'closed' } });
});

app.get('/api/vacancies/:id/applications', async (request, reply) => {
  const vacancyId = Number((request.params as any).id);
  return db.application.findMany({
    where: { vacancyId },
    include: { candidate: true },
    orderBy: { createdAt: 'desc' },
  });
});

app.post('/api/applications', async (request, reply) => {
  const body = request.body as any;
  if (!body?.vacancy_id || !body?.candidate_user_id) {
    return reply.code(400).send({ error: 'vacancy_id and candidate_user_id are required' });
  }

  try {
    const application = await db.application.create({
      data: {
        vacancyId: Number(body.vacancy_id),
        candidateUserId: Number(body.candidate_user_id),
        status: 'new',
        contact: body.contact ?? null,
      },
    });
    return reply.code(201).send(application);
  } catch (err: any) {
    // Уникальный constraint (vacancy_id, candidate_user_id) — см. миграцию add_application_unique
    if (err?.code === 'P2002') {
      return reply.code(409).send({ error: 'candidate already applied to this vacancy' });
    }
    throw err;
  }
});

app.patch('/api/applications/:id', async (request, reply) => {
  const id = Number((request.params as any).id);
  const body = request.body as any;
  if (!body?.status) {
    return reply.code(400).send({ error: 'status is required' });
  }

  return db.application.update({ where: { id }, data: { status: body.status } });
});

app.get('/api/benchmark', async (request, reply) => {
  const query = request.query as any;
  const regionCode = query?.region_code;
  const category = query?.category;
  if (!regionCode || !category) {
    return reply.code(400).send({ error: 'region_code and category are required' });
  }

  const benchmark = await getBenchmark(String(regionCode), String(category));
  if (!benchmark) return reply.code(404).send({ error: 'no benchmark data available' });
  return benchmark;
});

async function start() {
  try {
    const me = await maxApi.getMe();
    await maxApi.registerCommands([
      { name: 'новая_вакансия', description: 'Создать вакансию' },
      { name: 'отмена', description: 'Отменить текущий диалог' },
    ]);
    app.log.info({ me }, 'connected to MAX as bot');
  } catch (err) {
    app.log.error(err, 'failed to reach MAX API — проверьте MAX_BOT_TOKEN');
  }

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start();
