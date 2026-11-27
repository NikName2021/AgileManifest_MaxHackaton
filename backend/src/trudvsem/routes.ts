import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { sendError, zodFieldErrors } from '../errors.js';
import { db } from '../db.js';
import { IMPORT_LIMIT, importCompanyVacancies, parseCompanyId, previewCompanyVacancies } from './import.js';
import { handleInboundEmail, inboundAddress } from './inboundEmail.js';
import { config } from '../config.js';

// company — ИНН (10/12 цифр) или ОГРН (13/15 цифр); не передан — сохранённый ИНН работодателя.
const companyField = z.string().max(20).optional();
const previewQuery = z.object({ company: companyField }).strict();
const importBody = z
  .object({
    company: companyField,
    ids: z.array(z.string().regex(/^[0-9a-f-]{8,64}$/i, 'must be a vacancy id from the preview')).min(1).max(IMPORT_LIMIT).optional(),
  })
  .strict();

async function companyOf(userId: number, raw: string | undefined) {
  const value = raw ?? (await db.user.findUnique({ where: { id: userId }, select: { companyInn: true } }))?.companyInn ?? '';
  return parseCompanyId(value);
}

const COMPANY_ERROR = { company: ['company must be an INN (10 or 12 digits) or OGRN (13 or 15 digits)'] };

export function registerTrudvsemRoutes(app: FastifyInstance) {
  // Вакансии компании на «Работе России» и какие из них уже импортированы.
  app.get('/api/trudvsem/company-vacancies', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = previewQuery.safeParse(request.query);
    if (!parsed.success) return sendError(reply, 400, 'validation_error', 'invalid query', zodFieldErrors(parsed.error.flatten()));
    const company = await companyOf(request.sessionUserId!, parsed.data.company);
    if (!company) return sendError(reply, 400, 'validation_error', 'invalid company', COMPANY_ERROR);
    try {
      return await previewCompanyVacancies(request.sessionUserId!, company);
    } catch (err) {
      request.log.error({ err }, 'trudvsem company preview failed');
      return sendError(reply, 502, 'upstream_error', '«Работа России» сейчас недоступна, попробуйте позже');
    }
  });

  // Импорт выбранных вакансий черновиками; публикуются они обычным путём.
  app.post('/api/vacancies/import/trudvsem', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = importBody.safeParse(request.body ?? {});
    if (!parsed.success) return sendError(reply, 400, 'validation_error', 'invalid request body', zodFieldErrors(parsed.error.flatten()));
    const company = await companyOf(request.sessionUserId!, parsed.data.company);
    if (!company) return sendError(reply, 400, 'validation_error', 'invalid company', COMPANY_ERROR);
    try {
      return reply.code(201).send(await importCompanyVacancies(request.sessionUserId!, company, parsed.data.ids));
    } catch (err) {
      request.log.error({ err }, 'trudvsem import failed');
      return sendError(reply, 502, 'upstream_error', '«Работа России» сейчас недоступна, попробуйте позже');
    }
  });

  // Персональный адрес для писем об откликах с «Работы России». rotate=true — выдать новый
  // (старый перестаёт принимать письма).
  app.get('/api/me/inbound-email', { preHandler: requireAuth }, async (request) => inboundAddress(request.sessionUserId!, false));
  app.post('/api/me/inbound-email/rotate', { preHandler: requireAuth }, async (request) => inboundAddress(request.sessionUserId!, true));

  // Почтовый шлюз (MTA или сервис входящей почты) пересылает сюда письмо целиком (RFC 822).
  // Получатель — из ?to=, иначе из заголовков Delivered-To / X-Original-To / To.
  // text/plain Fastify и так отдаёт строкой; message/rfc822 — тоже строкой, до 1 МБ.
  app.addContentTypeParser('message/rfc822', { parseAs: 'string', bodyLimit: 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.post('/webhook/inbound-email', async (request, reply) => {
    if (!config.inboundEmailSecret) return sendError(reply, 503, 'service_unavailable', 'inbound email is not configured');
    if (request.headers['x-inbound-secret'] !== config.inboundEmailSecret) return sendError(reply, 401, 'unauthorized', 'bad inbound secret');
    if (typeof request.body !== 'string' || !request.body) return sendError(reply, 400, 'validation_error', 'raw message expected (message/rfc822)');
    const to = typeof (request.query as Record<string, unknown>)?.to === 'string' ? String((request.query as Record<string, unknown>).to) : undefined;
    return handleInboundEmail(request.body, to);
  });
}
