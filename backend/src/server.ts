import Fastify from 'fastify';
import cors from '@fastify/cors';
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
import { escapeMarkdown } from './markdown.js';
import { sendError, zodFieldErrors } from './errors.js';
import {
  createVacancySchema,
  updateVacancySchema,
  checkMergedVacancyConstraints,
  createApplicationSchema,
  updateApplicationStatusSchema,
  listApplicationsQuerySchema,
  authMaxSchema,
} from './validation.js';

const app = Fastify({ logger: true });

// CORS (раздел 1 фидбека фронтенда): frontend и API — разные origin (mini-app во встроенном
// WebView MAX может грузиться с отдельного хостинга), поэтому браузерные fetch-запросы с
// Authorization-заголовком не пройдут без явного CORS. FRONTEND_ORIGIN — список через запятую;
// если не задан, разрешаем всё (`origin: true`) для локальной разработки/жюри без готового
// прод-адреса фронта — перед реальной сдачей лучше сузить до конкретного origin в .env.
const allowedOrigins = config.frontendOrigin
  ? config.frontendOrigin.split(',').map((s) => s.trim()).filter(Boolean)
  : true;
app.register(cors, {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
});

// Требуемые подписки на вебхук — вынесено сюда, чтобы сверять их и при регистрации (start(),
// ниже), и при возможном будущем переиспользовании списка.
const WEBHOOK_UPDATE_TYPES = ['message_created', 'message_callback', 'bot_started'];

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
//
// Решение по ролям (осознанно, см. раздел 1.1 хендоффа фронтендера): в этой версии MVP роль не
// хранится отдельным полем в User — любой авторизованный пользователь может как создавать/публиковать
// вакансии (выступать работодателем), так и откликаться на чужие (выступать кандидатом). Что можно
// делать с конкретной записью, определяется владением (employerUserId / candidateUserId), а не ролью
// аккаунта. Если для финала понадобится разделение ролей — это отдельное расширение схемы (поле role
// на User) и не блокирует текущую интеграцию.
//
// Формат ошибок: везде единый конверт { error: { code, message, fields? } } — см. errors.ts.
// Формат сессии: Authorization: Bearer <token>, НЕ HttpOnly cookie — если существующий адаптер
// фронтенда рассчитан на cookie, его нужно переключить на заголовок (см. README.md).

app.post('/api/auth/max', async (request, reply) => {
  const parsed = authMaxSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
  }

  const verified = verifyMaxInitData(parsed.data.init_data);
  if (!verified.ok) {
    return sendError(reply, 401, 'unauthorized', verified.error);
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
    return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
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
      contactInfo: body.contact_info ?? null,
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
  if (!vacancy) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (vacancy.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }
  return vacancy;
});

// Редактирование черновика (раздел 3.1 хендоффа) — разрешено только пока вакансия в статусе
// draft. У опубликованной/закрытой вакансии карточка уже могла уйти в MAX или воронка уже идёт —
// молчаливое расхождение между БД и тем, что видели кандидаты, хуже явного 409.
app.patch('/api/vacancies/:id', { preHandler: requireAuth }, async (request, reply) => {
  const id = Number((request.params as any).id);
  const parsed = updateVacancySchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
  }

  const existing = await db.vacancy.findUnique({ where: { id } });
  if (!existing) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (existing.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }
  if (existing.status !== 'draft') {
    return sendError(reply, 409, 'conflict', 'only a draft vacancy can be edited');
  }

  const body = parsed.data;

  // salary_min<=salary_max и длина карточки проверяются на СЛИЯНИИ уже сохранённых полей с
  // частичным телом запроса, а не только на переданных полях — раньше PATCH только с salary_min
  // проходил проверку, даже если новый min становился больше уже сохранённого max (раздел 5
  // фидбека фронтенда: "диапазон 50 000–60 000, запрос только с salary_min: 70000 проходит").
  const merged = {
    title: body.title ?? existing.title,
    region_code: body.region_code ?? existing.regionCode,
    schedule: body.schedule ?? existing.schedule,
    salary_min: body.salary_min !== undefined ? body.salary_min : existing.salaryMin,
    salary_max: body.salary_max !== undefined ? body.salary_max : existing.salaryMax,
    description: body.description !== undefined ? body.description : existing.description,
    contact_info: body.contact_info !== undefined ? body.contact_info : existing.contactInfo,
  };
  const constraintCheck = checkMergedVacancyConstraints(merged);
  if (!constraintCheck.ok) {
    return sendError(reply, 400, 'validation_error', 'invalid request body', {
      [constraintCheck.field]: [constraintCheck.message],
    });
  }

  // Атомарная проверка+обновление одним запросом (раздел 2 фидбека фронтенда): раньше между
  // findUnique-проверкой статуса выше и update ниже вакансию мог успеть забрать параллельный
  // publish — окно гонки, пусть и маленькое. updateMany с тем же условием status:'draft' в WHERE
  // либо применяет изменение атомарно, либо (count===0) означает, что статус уже сменился
  // между чтением и записью — тогда отдаём тот же 409, что и при первичной проверке.
  const updateResult = await db.vacancy.updateMany({
    where: { id, status: 'draft' },
    data: {
      title: merged.title,
      regionCode: merged.region_code,
      ...(body.category !== undefined ? { category: body.category } : {}),
      schedule: merged.schedule,
      salaryMin: merged.salary_min,
      salaryMax: merged.salary_max,
      description: merged.description,
      contactInfo: merged.contact_info,
    },
  });
  if (updateResult.count === 0) {
    return sendError(reply, 409, 'conflict', 'only a draft vacancy can be edited');
  }

  const vacancy = await db.vacancy.findUniqueOrThrow({ where: { id } });
  return vacancy;
});

app.post('/api/vacancies/:id/publish', { preHandler: requireAuth }, async (request, reply) => {
  const id = Number((request.params as any).id);
  const existing = await db.vacancy.findUnique({ where: { id } });
  if (!existing) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (existing.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }

  try {
    const vacancy = await publishVacancy(id);
    return vacancy;
  } catch (err) {
    if (err instanceof PublishError) {
      if (err.kind === 'not_found') {
        return sendError(reply, 404, 'not_found', err.message);
      }
      if (err.kind === 'no_chat') {
        // Отдельный код вместо общего upstream_error (раздел 6 фидбека фронтенда) — frontend
        // может по этому коду явно предложить работодателю открыть личный чат с ботом, вместо
        // непонятного "сервис недоступен".
        return sendError(reply, 409, 'employer_chat_missing', err.message);
      }
      return sendError(reply, 409, 'conflict', err.message);
    }
    if ((err as any)?.name === 'TimeoutError') {
      // Таймаут ответа MAX — неизвестно, ушла карточка или нет. Вакансия НЕ откатывается в
      // draft (см. publish.ts) именно чтобы повторный вызов publish не создал вторую карточку —
      // явно говорим об этом клиенту, а не отдаём тот же upstream_error, что и на подтверждённый отказ.
      request.log.error(err, 'MAX did not confirm card delivery before timeout; vacancy stays published for a safe retry');
      return sendError(
        reply,
        502,
        'card_delivery_unknown',
        'MAX did not confirm the card was delivered before the request timed out. The vacancy stays published; call publish again to retry — this will not create a duplicate card.'
      );
    }
    request.log.error(err, 'failed to publish vacancy card, rolled back to draft');
    return sendError(reply, 502, 'upstream_error', 'failed to publish vacancy card to MAX, please retry');
  }
});

app.post('/api/vacancies/:id/close', { preHandler: requireAuth }, async (request, reply) => {
  const id = Number((request.params as any).id);
  const existing = await db.vacancy.findUnique({ where: { id } });
  if (!existing) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (existing.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }

  return db.vacancy.update({ where: { id }, data: { status: 'closed' } });
});

app.get('/api/vacancies/:id/applications', { preHandler: requireAuth }, async (request, reply) => {
  const vacancyId = Number((request.params as any).id);
  const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId } });
  if (!vacancy) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (vacancy.employerUserId !== request.sessionUserId) {
    // Список откликов содержит контакты кандидатов (телефон и т.п.) — раньше отдавался без
    // какой-либо проверки, кто спрашивает.
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }

  return db.application.findMany({
    where: { vacancyId },
    include: { candidate: true },
    orderBy: { createdAt: 'desc' },
  });
});

// Общий список откликов по всем вакансиям работодателя (раздел 3.2 хендоффа) — раньше был
// только список по одной вакансии; frontend собирал бы общий список серией запросов без пагинации.
app.get('/api/applications', { preHandler: requireAuth }, async (request, reply) => {
  const parsed = listApplicationsQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return sendError(reply, 400, 'validation_error', 'invalid query parameters', zodFieldErrors(parsed.error.flatten()));
  }
  const { status, limit, offset } = parsed.data;

  const [items, total] = await Promise.all([
    db.application.findMany({
      where: {
        vacancy: { employerUserId: request.sessionUserId },
        ...(status ? { status } : {}),
      },
      include: { candidate: true, vacancy: { select: { id: true, title: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.application.count({
      where: {
        vacancy: { employerUserId: request.sessionUserId },
        ...(status ? { status } : {}),
      },
    }),
  ]);

  return { items, total, limit, offset };
});

app.post('/api/applications', { preHandler: requireAuth }, async (request, reply) => {
  const parsed = createApplicationSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
  }
  const body = parsed.data;

  const vacancy = await db.vacancy.findUnique({ where: { id: body.vacancy_id }, include: { employer: true } });
  if (!vacancy) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (vacancy.status !== 'published') {
    return sendError(reply, 409, 'conflict', 'vacancy is not published, cannot apply');
  }

  const candidate = await db.user.findUnique({ where: { id: request.sessionUserId! } });
  if (!candidate) return sendError(reply, 404, 'not_found', 'candidate not found');

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
      return sendError(reply, 409, 'conflict', 'candidate already applied to this vacancy');
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
        `Новый отклик на вакансию «${escapeMarkdown(vacancy.title)}» (через мини-приложение):\n` +
          `Кандидат: ${escapeMarkdown(candidate.displayName ?? 'без имени в MAX')}\n` +
          `Контакт: ${escapeMarkdown(application.contact ?? 'не указан')}`,
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
    return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
  }

  const application = await db.application.findUnique({ where: { id }, include: { vacancy: true } });
  if (!application) return sendError(reply, 404, 'not_found', 'application not found');
  if (application.vacancy.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }

  // applyStatusChange общий с обработчиком кнопок в чате — кандидат получит уведомление
  // в MAX и при смене статуса через API, не только через кнопки в чате работодателя.
  const result = await applyStatusChange(id, parsed.data.status);
  return reply.send({ ...result.application, notified: result.notified, unchanged: result.unchanged ?? false });
});

app.get('/api/benchmark', async (request, reply) => {
  const query = request.query as any;
  const regionCode = query?.region_code;
  const category = query?.category;
  if (!regionCode || !category) {
    return sendError(reply, 400, 'validation_error', 'region_code and category are required');
  }

  const benchmark = await getBenchmark(String(regionCode), String(category));
  if (!benchmark) return sendError(reply, 404, 'not_found', 'no benchmark data available');
  return benchmark;
});

// Единый обработчик ошибок — чтобы наружу не утекал сырой стектрейс/формат Fastify,
// и чтобы неожиданные ошибки (например нарушение внешнего ключа в Prisma) не роняли процесс,
// а возвращали предсказуемый JSON в том же конверте { error: { code, message } }, что и остальной API.
app.setErrorHandler((err: any, request, reply) => {
  request.log.error(err, 'unhandled request error');

  // Валидация тела/параметров Fastify — 400 с понятным сообщением
  if (err.validation) {
    return sendError(reply, 400, 'validation_error', err.message);
  }

  // Частые коды ошибок Prisma
  if (err.code === 'P2002') {
    return sendError(reply, 409, 'conflict', 'duplicate record');
  }
  if (err.code === 'P2003') {
    return sendError(reply, 400, 'validation_error', 'invalid reference: related record does not exist');
  }
  if (err.code === 'P2025') {
    return sendError(reply, 404, 'not_found', 'record not found');
  }

  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  return sendError(reply, status, status === 500 ? 'internal_error' : 'validation_error', status === 500 ? 'internal server error' : err.message);
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
        const existing = (await maxApi.listSubscriptions()) as {
          subscriptions?: { url?: string; update_types?: string[] }[];
        };
        const existingSub = existing?.subscriptions?.find((s) => s.url === webhookUrl);
        // Сверяем не только URL, но и набор update_types — раньше при добавлении нового типа
        // события (bot_started) уже зарегистрированная на этот же URL старая подписка считалась
        // "актуальной" и никогда не обновлялась, то есть deep-link отклик тихо не заработал бы
        // на уже развёрнутом окружении (раздел 2.6 хендоффа).
        const hasAllTypes = existingSub
          ? WEBHOOK_UPDATE_TYPES.every((t) => existingSub.update_types?.includes(t))
          : false;

        if (!existingSub) {
          await maxApi.createSubscription(webhookUrl, WEBHOOK_UPDATE_TYPES);
          app.log.info({ webhookUrl }, 'MAX webhook subscription registered');
        } else if (!hasAllTypes) {
          // POST /subscriptions не документирован как upsert по URL — на всякий случай сначала
          // удаляем старую подписку на этот URL, потом создаём заново с полным списком типов,
          // чтобы не получить два независимых webhook-события на один и тот же апдейт.
          await maxApi.deleteSubscription(webhookUrl).catch((err) => {
            app.log.warn(err, 'failed to delete stale MAX webhook subscription before re-registering (continuing anyway)');
          });
          await maxApi.createSubscription(webhookUrl, WEBHOOK_UPDATE_TYPES);
          app.log.info({ webhookUrl, previousTypes: existingSub.update_types }, 'MAX webhook subscription re-registered with updated update_types');
        } else {
          app.log.info({ webhookUrl }, 'MAX webhook subscription already registered with correct update_types, skipping');
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
