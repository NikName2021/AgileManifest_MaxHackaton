import Fastify from 'fastify';
import { config } from './config.js';
import { maxApi } from './max/client.js';
import { registerMaxWebhook } from './max/webhook.js';
import { setBotUsername } from './max/botInfo.js';
import { db } from './db.js';
import { publishVacancy, PublishError } from './vacancies/publish.js';
import { getBenchmark } from './trudvsem/benchmarkService.js';
import { applyStatusChange, funnelButtons } from './application/service.js';
import { startStaleVacancyReminders } from './vacancies/reminders.js';
import { requireAuth } from './auth/middleware.js';
import { verifyMaxInitData } from './auth/maxInitData.js';
import { issueSessionToken } from './auth/session.js';
import { findOrCreateUserByMaxId } from './users/service.js';
import {
  createVacancySchema,
  createApplicationSchema,
  updateApplicationStatusSchema,
  authMaxSchema,
} from './validation.js';

const app = Fastify({ logger: true });

registerMaxWebhook(app);

// Служебный healthcheck — пригодится и для Docker, и для проверки, что backend жив.
// Проверяет не только сам процесс, но и реальную доступность БД (readiness, не просто liveness).
app.get('/health', async (request, reply) => {
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, db: 'up' };
  } catch (err) {
    request.log.error(err, 'health check: db unreachable');
    return reply.code(503).send({ ok: false, db: 'down' });
  }
});

// --- Собственный backend API (раздел 6 ТЗ) ---
// Мутирующие эндпоинты и всё, что читает чужие данные (например список откликов с контактами
// кандидатов), защищены requireAuth (см. auth/middleware.ts). Мини-апп получает сессионный токен
// через POST /api/auth/max (initData -> проверка HMAC-подписи -> собственная сессия), а жюри может
// тестировать API без реального MAX-логина через TEST_API_TOKEN из .env.

app.post('/api/auth/max', async (request, reply) => {
  const parsed = authMaxSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'validation failed', details: parsed.error.flatten() });
  }

  const verified = verifyMaxInitData(parsed.data.init_data);
  if (!verified.ok) {
    return reply.code(401).send({ error: verified.error });
  }

  const user = await findOrCreateUserByMaxId(verified.data.user.id, verified.data.user.name);
  const token = issueSessionToken(user.id);
  return { token, user_id: user.id };
});

app.get('/api/vacancies', { preHandler: requireAuth }, async (request) => {
  return db.vacancy.findMany({
    where: { employerUserId: request.sessionUserId },
    orderBy: { createdAt: 'desc' },
  });
});

app.post('/api/vacancies', { preHandler: requireAuth }, async (request, reply) => {
  const parsed = createVacancySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'validation failed', details: parsed.error.flatten() });
  }
  const body = parsed.data;

  const employer = await db.user.findUnique({ where: { id: request.sessionUserId! } });
  const vacancy = await db.vacancy.create({
    data: {
      employerUserId: request.sessionUserId!,
      title: body.title,
      regionCode: body.region_code ?? '',
      category: body.category ?? 'general',
      schedule: body.schedule ?? 'temporary',
      salaryMin: body.salary_min ?? null,
      salaryMax: body.salary_max ?? null,
      description: body.description ?? null,
      status: 'draft',
      // Лучшее известное на момент создания через REST/мини-апп. Может быть пустой строкой у
      // пользователей мини-аппа, ещё не писавших боту напрямую (см. findOrCreateUserByMaxId) —
      // тогда публикация (см. publish.ts) осмысленно упадёт, пока пользователь не откроет чат с ботом.
      employerChatId: employer?.chatId || null,
    },
  });

  return reply.code(201).send(vacancy);
});

app.get('/api/vacancies/:id', { preHandler: requireAuth }, async (request, reply) => {
  const id = Number((request.params as any).id);
  const vacancy = await db.vacancy.findUnique({ where: { id } });
  if (!vacancy) return reply.code(404).send({ error: 'vacancy not found' });
  if (vacancy.employerUserId !== request.sessionUserId) {
    return reply.code(403).send({ error: 'not your vacancy' });
  }
  return vacancy;
});

app.post('/api/vacancies/:id/publish', { preHandler: requireAuth }, async (request, reply) => {
  const id = Number((request.params as any).id);
  const existing = await db.vacancy.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'vacancy not found' });
  if (existing.employerUserId !== request.sessionUserId) {
    return reply.code(403).send({ error: 'not your vacancy' });
  }

  try {
    const vacancy = await publishVacancy(id);
    return vacancy;
  } catch (err) {
    if (err instanceof PublishError) {
      return reply.code(err.kind === 'not_found' ? 404 : 409).send({ error: err.message });
    }
    request.log.error(err, 'failed to publish vacancy card, rolled back to draft');
    return reply.code(502).send({ error: 'failed to publish vacancy card to MAX, please retry' });
  }
});

app.post('/api/vacancies/:id/close', { preHandler: requireAuth }, async (request, reply) => {
  const id = Number((request.params as any).id);
  const existing = await db.vacancy.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'vacancy not found' });
  if (existing.employerUserId !== request.sessionUserId) {
    return reply.code(403).send({ error: 'not your vacancy' });
  }

  return db.vacancy.update({ where: { id }, data: { status: 'closed' } });
});

app.get('/api/vacancies/:id/applications', { preHandler: requireAuth }, async (request, reply) => {
  const vacancyId = Number((request.params as any).id);
  const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId } });
  if (!vacancy) return reply.code(404).send({ error: 'vacancy not found' });
  if (vacancy.employerUserId !== request.sessionUserId) {
    // Список откликов содержит контакты кандидатов (телефон и т.п.) — раньше отдавался без
    // какой-либо проверки, кто спрашивает.
    return reply.code(403).send({ error: 'not your vacancy' });
  }

  return db.application.findMany({
    where: { vacancyId },
    include: { candidate: true },
    orderBy: { createdAt: 'desc' },
  });
});

app.post('/api/applications', { preHandler: requireAuth }, async (request, reply) => {
  const parsed = createApplicationSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'validation failed', details: parsed.error.flatten() });
  }
  const body = parsed.data;

  const vacancy = await db.vacancy.findUnique({ where: { id: body.vacancy_id }, include: { employer: true } });
  if (!vacancy) return reply.code(404).send({ error: 'vacancy not found' });
  if (vacancy.status !== 'published') {
    return reply.code(409).send({ error: 'vacancy is not published, cannot apply' });
  }

  const candidate = await db.user.findUnique({ where: { id: request.sessionUserId! } });
  if (!candidate) return reply.code(404).send({ error: 'candidate not found' });

  let application;
  try {
    application = await db.application.create({
      data: {
        vacancyId: vacancy.id,
        candidateUserId: candidate.id,
        status: 'new',
        contact: body.contact ?? null,
        candidateChatId: candidate.chatId || null,
      },
    });
  } catch (err: any) {
    // Уникальный constraint (vacancy_id, candidate_user_id) — см. миграцию add_application_unique
    if (err?.code === 'P2002') {
      return reply.code(409).send({ error: 'candidate already applied to this vacancy' });
    }
    throw err;
  }

  // Отклик через REST (мини-апп) — раньше здесь вообще не было уведомления работодателя,
  // хотя ровно та же ситуация через бот-диалог его получает.
  const targetChatId = vacancy.employerChatId || vacancy.employer.chatId;
  let notified = false;
  if (targetChatId) {
    try {
      await maxApi.sendMessage(
        targetChatId,
        `Новый отклик на вакансию «${vacancy.title}» (через мини-приложение):\nКандидат: ${candidate.displayName ?? 'без имени в MAX'}\nКонтакт: ${application.contact ?? 'не указан'}`,
        funnelButtons(application.id)
      );
      notified = true;
    } catch (err) {
      // Отклик уже сохранён — сбой уведомления не должен превращать успешное создание в ошибку.
      request.log.error(err, 'failed to notify employer about new application via REST');
    }
  }

  return reply.code(201).send({ ...application, notified });
});

app.patch('/api/applications/:id', { preHandler: requireAuth }, async (request, reply) => {
  const id = Number((request.params as any).id);
  const parsed = updateApplicationStatusSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'validation failed', details: parsed.error.flatten() });
  }

  const application = await db.application.findUnique({ where: { id }, include: { vacancy: true } });
  if (!application) return reply.code(404).send({ error: 'application not found' });
  if (application.vacancy.employerUserId !== request.sessionUserId) {
    return reply.code(403).send({ error: 'not your vacancy' });
  }

  // applyStatusChange общий с обработчиком кнопок в чате — кандидат получит уведомление
  // в MAX и при смене статуса через API, не только через кнопки в чате работодателя.
  const result = await applyStatusChange(id, parsed.data.status);
  return reply.send({ ...result.application, notified: result.notified });
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

// Единый обработчик ошибок — чтобы наружу не утекал сырой стектрейс/формат Fastify,
// и чтобы неожиданные ошибки (например нарушение внешнего ключа в Prisma) не роняли процесс,
// а возвращали предсказуемый JSON. Часть "обработки краевых случаев" из Фазы 4 плана (раздел 16 ТЗ).
app.setErrorHandler((err: any, request, reply) => {
  request.log.error(err, 'unhandled request error');

  // Валидация тела/параметров Fastify — 400 с понятным сообщением
  if (err.validation) {
    return reply.code(400).send({ error: 'validation failed', details: err.message });
  }

  // Частые коды ошибок Prisma
  if (err.code === 'P2002') {
    return reply.code(409).send({ error: 'conflict: duplicate record' });
  }
  if (err.code === 'P2003') {
    return reply.code(400).send({ error: 'invalid reference: related record does not exist' });
  }
  if (err.code === 'P2025') {
    return reply.code(404).send({ error: 'record not found' });
  }

  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  return reply.code(status).send({ error: status === 500 ? 'internal server error' : err.message });
});

async function start() {
  try {
    const me = await maxApi.getMe();
    // MAX_BOT_USERNAME из .env — явный приоритет над автоопределением, на случай если поле
    // в ответе /me называется иначе, чем мы предполагаем (см. TODO ниже).
    setBotUsername(config.botUsernameOverride ?? (me as any)?.username); // TODO: сверить имя поля с реальным ответом /me
    await maxApi.registerCommands([
      { name: 'новая_вакансия', description: 'Создать вакансию' },
      { name: 'отмена', description: 'Отменить текущий диалог' },
    ]);
    app.log.info({ me }, 'connected to MAX as bot');

    if (config.publicBaseUrl) {
      try {
        // Секрет больше НЕ зашиваем в URL query-параметром — по документации dev.max.ru MAX
        // присылает его исключительно в заголовке X-Max-Bot-Api-Secret на каждом вызове вебхука
        // (см. max/webhook.ts), а держать секрет в URL было небезопасно: он утекал бы в лог строки
        // ниже и в любые логи прокси/туннеля, через которые проходит регистрация подписки.
        const webhookUrl = `${config.publicBaseUrl}/webhook/max`;
        // Идемпотентность: не плодим дублирующие подписки при каждом рестарте backend —
        // TODO: поле с URL в ответе /subscriptions называется по документации, не проверено живым вызовом.
        const existing = (await maxApi.listSubscriptions()) as { subscriptions?: { url?: string }[] };
        const alreadySubscribed = existing?.subscriptions?.some((s) => s.url === webhookUrl);

        if (!alreadySubscribed) {
          await maxApi.createSubscription(webhookUrl, ['message_created', 'message_callback', 'bot_started']);
          app.log.info({ webhookUrl }, 'MAX webhook subscription registered');
        } else {
          app.log.info({ webhookUrl }, 'MAX webhook subscription already registered, skipping');
        }
      } catch (subErr) {
        app.log.error(subErr, 'failed to register MAX webhook subscription');
      }
    } else {
      app.log.warn(
        'PUBLIC_BASE_URL is not set — MAX webhook subscription NOT registered, bot will not receive live updates. ' +
          'Set PUBLIC_BASE_URL (e.g. an ngrok URL) before a live MAX test.'
      );
    }
  } catch (err) {
    app.log.error(err, 'failed to reach MAX API — проверьте MAX_BOT_TOKEN');
  }

  startStaleVacancyReminders();

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start();
