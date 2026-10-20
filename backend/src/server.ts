import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { maxApi } from './max/client.js';
import { registerMaxWebhook } from './max/webhook.js';
import { setBotUsername } from './max/botInfo.js';
import { db } from './db.js';
import { publishVacancy, PublishError } from './vacancies/publish.js';
import { getBenchmark } from './trudvsem/benchmarkService.js';
import { applyStatusChange, funnelButtons, createApplicationRecord, type CreateApplicationError } from './application/service.js';
import { registerCandidateRoutes } from './candidate/routes.js';
import { registerTeamRoutes } from './team/routes.js';
import { registerPosterRoutes } from './vacancies/posterRoutes.js';
import { registerSubscriptionRoutes } from './subscriptions/routes.js';
import { registerChannelRoutes } from './channels/routes.js';
import { setShift, startShiftReminders } from './shifts/service.js';
import { normalizeRegion } from './regions/dictionary.js';
import { backfillRegionSubjects, listRegions, regionDto } from './regions/service.js';
import { buildApplyDeepLink } from './vacancies/cardText.js';
import type { Vacancy } from '@prisma/client';
import { startStaleVacancyReminders } from './vacancies/reminders.js';
import { requireAuth } from './auth/middleware.js';
import { verifyMaxInitData } from './auth/maxInitData.js';
import { issueSessionToken } from './auth/session.js';
import { findOrCreateUserByMaxId } from './users/service.js';
import { escapeMarkdown } from './markdown.js';
import { sendError, zodFieldErrors, type ErrorCode } from './errors.js';
import {
  createVacancySchema,
  updateVacancySchema,
  checkMergedVacancyConstraints,
  createApplicationSchema,
  updateApplicationStatusSchema,
  listApplicationsQuerySchema,
  authMaxSchema,
  benchmarkQuerySchema,
  idParamSchema,
  setShiftSchema,
} from './validation.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Экспорт для интеграционных тестов (app.inject без порта и без MAX).
export const app = Fastify({ logger: process.env.VITEST ? false : true });

// Mini-app и API на разных origin. Без FRONTEND_ORIGIN разрешён любой — для продакшена задать явно.
const allowedOrigins = config.frontendOrigin
  ? config.frontendOrigin.split(',').map((s) => s.trim()).filter(Boolean)
  : true;
app.register(cors, {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
});

const WEBHOOK_UPDATE_TYPES = ['message_created', 'message_callback', 'bot_started', 'bot_added', 'bot_removed'];

registerMaxWebhook(app);
registerCandidateRoutes(app);
registerTeamRoutes(app);
registerPosterRoutes(app);
registerSubscriptionRoutes(app);
registerChannelRoutes(app);

// Ссылка для ручной пересылки — в том числе для карточек, отправленных до появления ссылки в тексте.
// null — вакансия не опубликована или username бота неизвестен.
function withApplyUrl(vacancy: Vacancy) {
  return {
    ...vacancy,
    subject: regionDto(vacancy.regionSubject),
    applyUrl: vacancy.status === 'published' ? buildApplyDeepLink(vacancy.id) : null,
  };
}

function parseIdParam(request: FastifyRequest, reply: FastifyReply): number | undefined {
  const parsed = idParamSchema.safeParse(request.params);
  if (!parsed.success) {
    sendError(reply, 400, 'validation_error', 'invalid id', zodFieldErrors(parsed.error.flatten()));
    return undefined;
  }
  return parsed.data.id;
}

const CANDIDATE_SUMMARY_SELECT = { id: true, maxUserId: true, displayName: true, phone: true } as const;

// Readiness: проверяет и процесс, и доступность БД.
app.get('/health', async (request, reply) => {
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, db: 'up' };
  } catch (err) {
    request.log.error(err, 'health check: db unreachable');
    return reply.code(503).send({ ok: false, db: 'down' });
  }
});

// Роли в User не хранятся: любой пользователь может и публиковать вакансии, и откликаться.
// Доступ к записи определяется владением (employerUserId / candidateUserId).

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
  const vacancies = await db.vacancy.findMany({
    where: { employerUserId: request.sessionUserId },
    orderBy: { createdAt: 'desc' },
  });
  return vacancies.map(withApplyUrl);
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
      regionSubject: normalizeRegion(body.region_code),
      category: body.category ?? 'general',
      schedule: body.schedule ?? 'temporary',
      salaryMin: body.salary_min ?? null,
      salaryMax: body.salary_max ?? null,
      description: body.description ?? null,
      contactInfo: body.contact_info ?? null,
      headcount: body.headcount ?? null,
      studentFriendly: body.student_friendly ?? false,
      status: 'draft',
      // Пусто, если пользователь ещё не писал боту — тогда publish вернёт employer_chat_missing.
      employerChatId: employer?.dialogChatId || employer?.chatId || null,
    },
  });

  return reply.code(201).send(withApplyUrl(vacancy));
});

app.get('/api/vacancies/:id', { preHandler: requireAuth }, async (request, reply) => {
  const id = parseIdParam(request, reply);
  if (id === undefined) return reply;
  const vacancy = await db.vacancy.findUnique({ where: { id } });
  if (!vacancy) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (vacancy.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }
  return withApplyUrl(vacancy);
});

// Только черновик: опубликованная карточка уже могла уйти в MAX, правка разошлась бы с ней.
app.patch('/api/vacancies/:id', { preHandler: requireAuth }, async (request, reply) => {
  const id = parseIdParam(request, reply);
  if (id === undefined) return reply;
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

  // Межполевые проверки — на слиянии с сохранёнными значениями, а не только на переданных полях.
  const merged = {
    title: body.title ?? existing.title,
    region_code: body.region_code ?? existing.regionCode,
    schedule: body.schedule ?? existing.schedule,
    salary_min: body.salary_min !== undefined ? body.salary_min : existing.salaryMin,
    salary_max: body.salary_max !== undefined ? body.salary_max : existing.salaryMax,
    description: body.description !== undefined ? body.description : existing.description,
    contact_info: body.contact_info !== undefined ? body.contact_info : existing.contactInfo,
    headcount: body.headcount !== undefined ? body.headcount : existing.headcount,
    student_friendly: body.student_friendly ?? existing.studentFriendly,
  };
  const constraintCheck = checkMergedVacancyConstraints(merged);
  if (!constraintCheck.ok) {
    return sendError(reply, 400, 'validation_error', 'invalid request body', {
      [constraintCheck.field]: [constraintCheck.message],
    });
  }

  // status: 'draft' в WHERE — защита от параллельного publish между проверкой выше и записью.
  const updateResult = await db.vacancy.updateMany({
    where: { id, status: 'draft' },
    data: {
      title: merged.title,
      regionCode: merged.region_code,
      regionSubject: normalizeRegion(merged.region_code),
      ...(body.category !== undefined ? { category: body.category } : {}),
      schedule: merged.schedule,
      salaryMin: merged.salary_min,
      salaryMax: merged.salary_max,
      description: merged.description,
      contactInfo: merged.contact_info,
      headcount: merged.headcount,
      studentFriendly: merged.student_friendly,
    },
  });
  if (updateResult.count === 0) {
    return sendError(reply, 409, 'conflict', 'only a draft vacancy can be edited');
  }

  const vacancy = await db.vacancy.findUniqueOrThrow({ where: { id } });
  return withApplyUrl(vacancy);
});

app.post('/api/vacancies/:id/publish', { preHandler: requireAuth }, async (request, reply) => {
  const id = parseIdParam(request, reply);
  if (id === undefined) return reply;
  const existing = await db.vacancy.findUnique({ where: { id } });
  if (!existing) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (existing.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }

  try {
    const vacancy = await publishVacancy(id);
    return withApplyUrl(vacancy);
  } catch (err) {
    if (err instanceof PublishError) {
      if (err.kind === 'not_found') {
        return sendError(reply, 404, 'not_found', err.message);
      }
      if (err.kind === 'no_chat') {
        return sendError(reply, 409, 'employer_chat_missing', err.message);
      }
      return sendError(reply, 409, 'conflict', err.message);
    }
    if ((err as any)?.name === 'TimeoutError') {
      // Неизвестно, ушла ли карточка: вакансия остаётся published, повторный publish безопасен.
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
  const id = parseIdParam(request, reply);
  if (id === undefined) return reply;
  const existing = await db.vacancy.findUnique({ where: { id } });
  if (!existing) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (existing.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }

  return withApplyUrl(await db.vacancy.update({ where: { id }, data: { status: 'closed' } }));
});

app.get('/api/vacancies/:id/applications', { preHandler: requireAuth }, async (request, reply) => {
  const vacancyId = parseIdParam(request, reply);
  if (vacancyId === undefined) return reply;
  const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId } });
  if (!vacancy) return sendError(reply, 404, 'not_found', 'vacancy not found');
  if (vacancy.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }

  return db.application.findMany({
    where: { vacancyId },
    include: { candidate: { select: CANDIDATE_SUMMARY_SELECT } },
    orderBy: { createdAt: 'desc' },
  });
});

// Входящие отклики по всем вакансиям работодателя.
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
      include: { candidate: { select: CANDIDATE_SUMMARY_SELECT }, vacancy: { select: { id: true, title: true, status: true } } },
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

const CREATE_APPLICATION_ERRORS: Record<CreateApplicationError, { status: number; code: ErrorCode; message: string }> = {
  not_found: { status: 404, code: 'not_found', message: 'vacancy not found' },
  self_application_forbidden: { status: 403, code: 'self_application_forbidden', message: 'cannot apply to your own vacancy' },
  vacancy_unavailable: { status: 409, code: 'vacancy_unavailable', message: 'vacancy is not published, cannot apply' },
  already_applied: { status: 409, code: 'already_applied', message: 'candidate already applied to this vacancy' },
};

app.post('/api/applications', { preHandler: requireAuth }, async (request, reply) => {
  const parsed = createApplicationSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
  }
  const body = parsed.data;

  const candidate = await db.user.findUnique({ where: { id: request.sessionUserId! } });
  if (!candidate) return sendError(reply, 401, 'unauthorized', 'session user no longer exists');

  // Та же функция, что и у отклика через бота.
  const result = await createApplicationRecord({
    vacancyId: body.vacancy_id,
    candidateUserId: candidate.id,
    contact: body.contact,
    // Только личный чат: последний chatId мог быть групповым. null — кандидат не запускал бота.
    candidateChatId: candidate.dialogChatId,
    source: 'miniapp',
  });
  if (!result.ok) {
    const e = CREATE_APPLICATION_ERRORS[result.error];
    return sendError(reply, e.status, e.code, e.message);
  }
  const application = result.application;

  // Сбой MAX не отменяет сохранённый отклик — только notified: false.
  const vacancy = await db.vacancy.findUniqueOrThrow({ where: { id: application.vacancyId }, include: { employer: true } });
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
      // Контакт кандидата в лог не пишем.
      request.log.error({ err, applicationId: application.id }, 'failed to notify employer about new application via REST');
    }
  }

  // candidateChatId кандидату не отдаём. notified — уведомление работодателя.
  return reply.code(201).send({
    id: application.id,
    vacancyId: application.vacancyId,
    candidateUserId: application.candidateUserId,
    status: application.status,
    contact: application.contact,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    notified,
  });
});

app.patch('/api/applications/:id', { preHandler: requireAuth }, async (request, reply) => {
  const id = parseIdParam(request, reply);
  if (id === undefined) return reply;
  const parsed = updateApplicationStatusSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
  }

  const application = await db.application.findUnique({ where: { id }, include: { vacancy: true } });
  if (!application) return sendError(reply, 404, 'not_found', 'application not found');
  if (application.vacancy.employerUserId !== request.sessionUserId) {
    return sendError(reply, 403, 'forbidden', 'not your vacancy');
  }

  // Общая с кнопками в чате функция — кандидат получает уведомление в обоих случаях.
  const result = await applyStatusChange(id, parsed.data.status);
  const { candidate, vacancy, ...updated } = result.application;
  return reply.send({
    ...updated,
    candidate: { id: candidate.id, maxUserId: candidate.maxUserId, displayName: candidate.displayName, phone: candidate.phone },
    vacancy: { id: vacancy.id, title: vacancy.title, status: vacancy.status },
    notified: result.notified,
    unchanged: result.unchanged ?? false,
    vacancyClosed: result.vacancyClosed ?? false,
  });
});

// Время выхода на смену для приглашённого или нанятого кандидата; кандидат подтверждает в боте.
app.patch('/api/applications/:id/shift', { preHandler: requireAuth }, async (request, reply) => {
  const id = parseIdParam(request, reply);
  if (id === undefined) return reply;
  const parsed = setShiftSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
  }
  const startAt = parsed.data.start_at ? new Date(parsed.data.start_at) : null;
  const result = await setShift(request.sessionUserId!, id, startAt, parsed.data.note ?? null);
  if (!result.ok) {
    if (result.error === 'not_found') return sendError(reply, 404, 'not_found', 'application not found');
    if (result.error === 'forbidden') return sendError(reply, 403, 'forbidden', 'not your vacancy');
    if (result.error === 'in_past') return sendError(reply, 400, 'validation_error', 'start_at is in the past', { start_at: ['must be in the future'] });
    return sendError(reply, 409, 'conflict', 'a shift can be set only for invited or hired candidates');
  }
  const a = result.application;
  return { id: a.id, startAt: a.startAt, shiftNote: a.shiftNote, attendance: a.attendance, notified: result.notified };
});

// Справочник субъектов РФ для выбора региона в мини-приложении.
app.get('/api/regions', async () => ({ items: listRegions() }));

app.get('/api/benchmark', async (request, reply) => {
  const parsed = benchmarkQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return sendError(reply, 400, 'validation_error', 'region_code and category are required', zodFieldErrors(parsed.error.flatten()));
  }

  const benchmark = await getBenchmark(parsed.data.region_code, parsed.data.category);
  if (!benchmark) return sendError(reply, 404, 'not_found', 'no benchmark data available');
  return benchmark;
});

// Неожиданные ошибки — в том же конверте, без стектрейса наружу.
app.setErrorHandler((err: any, request, reply) => {
  request.log.error(err, 'unhandled request error');

  if (err.validation) {
    return sendError(reply, 400, 'validation_error', err.message);
  }

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
  setBotUsername(config.botUsernameOverride);
  try {
    const me = await maxApi.getMe();
    if (!config.botUsernameOverride) setBotUsername((me as any)?.username); // TODO: сверить имя поля с реальным ответом /me
    await maxApi.registerCommands([
      { name: 'новая_вакансия', description: 'Создать вакансию' },
      { name: 'отмена', description: 'Отменить текущий диалог' },
      { name: 'отписаться', description: 'Не присылать новые вакансии' },
    ]);
    app.log.info({ me }, 'connected to MAX as bot');

    if (config.publicBaseUrl) {
      try {
        // Секрет передаётся при создании подписки, MAX присылает его в заголовке X-Max-Bot-Api-Secret.
        const webhookUrl = `${config.publicBaseUrl}/webhook/max`;
        const existing = (await maxApi.listSubscriptions()) as {
          subscriptions?: { url?: string; update_types?: string[] }[];
        };
        const existingSub = existing?.subscriptions?.find((s) => s.url === webhookUrl);
        // Подписку на тот же URL без нужных update_types пересоздаём, иначе новые типы событий не придут.
        const hasAllTypes = existingSub
          ? WEBHOOK_UPDATE_TYPES.every((t) => existingSub.update_types?.includes(t))
          : false;

        if (!existingSub) {
          await maxApi.createSubscription(webhookUrl, WEBHOOK_UPDATE_TYPES);
          app.log.info({ webhookUrl }, 'MAX webhook subscription registered');
        } else if (!hasAllTypes) {
          // POST /subscriptions не документирован как upsert — удаляем старую, чтобы не получать события дважды.
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

  backfillRegionSubjects()
    .then((n) => n > 0 && app.log.info({ updated: n }, 'region_subject backfilled'))
    .catch((err) => app.log.error(err, 'region_subject backfill failed'));
  startStaleVacancyReminders();
  startShiftReminders();

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

if (!process.env.VITEST) start();
