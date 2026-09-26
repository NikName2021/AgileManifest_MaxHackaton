import type { FastifyInstance } from 'fastify';
import { maxApi } from './client.js';
import { config } from '../config.js';
import { upsertUser } from '../users/service.js';
import { startFlow, cancelFlow, handleAnswer } from '../dialog/engine.js';
import { handleApplyClick, resolvePendingApplication, handleStatusChangeFromChat } from '../application/service.js';

// MAX может присылать chat_id/user_id и числом, и строкой — в схеме БД это String,
// поэтому всегда приводим к строке в одном месте, а не полагаемся на неявное приведение Prisma.
function toStringId(raw: unknown): string | undefined {
    return raw !== undefined && raw !== null ? String(raw) : undefined;
}

// Разбор VCF (payload.vcf_info, см. dev.max.ru/docs-api/use-cases/sending-messages/another-attachments) —
// вложение контакта в MAX приходит как vCard-текст, а не готовым номером. Ищем строку вида
// "TEL...:<номер>" (регистронезависимо, с необязательными типами вроде TEL;TYPE=CELL:).
function extractPhoneFromVcf(vcf: string): string | undefined {
    const match = /^TEL[^:\n]*:(.+)$/im.exec(vcf);
    if (!match) return undefined;
    const phone = match[1].trim();
    return phone || undefined;
}

// TODO: точная структура вложения для нажатия кнопки request_contact подтверждена частично —
// vcf_info описан в документации как формат вложения контакта, но живым вызовом не проверен.
// У кандидата всегда есть фолбэк — просто написать контакт текстом (обрабатывается тем же путём).
function extractContactFromMessage(update: any): string | undefined {
    const text = (update.message?.body?.text ?? update.message?.text ?? '').trim();
    if (text) return text;

    const attachments = update.message?.body?.attachments ?? [];
    const contactAttachment = attachments.find((a: any) => a?.type === 'contact');
    if (!contactAttachment) return undefined;

    const vcfInfo = contactAttachment?.payload?.vcf_info;
    if (typeof vcfInfo === 'string') {
        const phoneFromVcf = extractPhoneFromVcf(vcfInfo);
        if (phoneFromVcf) return phoneFromVcf;
    }

    // Старые непроверенные поля — оставлены как дополнительный фолбэк на случай другого формата ответа.
    const legacyPhone = contactAttachment?.payload?.vcf_phone ?? contactAttachment?.payload?.phone;
    if (legacyPhone) return String(legacyPhone);

    // contact_id без телефона (см. раздел 1.3 хендоффа) — извлечь номер невозможно, кандидату
    // придётся написать контакт текстом; resolvePendingApplication и так переспросит при undefined.
    return undefined;
}

// Отклик через deep link (https://max.ru/<bot>?start=apply_<id>) — payload у deep link'а в
// формате "apply_123" (без двоеточия), чтобы не путать с payload инлайн-кнопок вида "apply:123"
// и не зависеть от того, как MAX кодирует спецсимволы в query-параметре start=.
function parseDeepLinkApplyPayload(payload: unknown): number | undefined {
    if (typeof payload !== 'string') return undefined;
    const match = /^apply_(\d+)$/.exec(payload);
    if (!match) return undefined;
    const id = Number(match[1]);
    return Number.isFinite(id) ? id : undefined;
}

export function registerMaxWebhook(app: FastifyInstance) {
  app.post('/webhook/max', async (request, reply) => {
    // Если backend публично доступен (задан PUBLIC_BASE_URL — так регистрируется вебхук-подписка,
    // см. server.ts), но секрет не настроен — отказываем всем вызовам целиком, а не пропускаем
    // их без проверки. Раньше пустой MAX_WEBHOOK_SECRET означал "проверки нет вообще", то есть
    // публичный вебхук был открыт для любого, кто узнает URL (раздел 2.6 хендоффа).
    if (config.publicBaseUrl && !config.maxWebhookSecret) {
      app.log.error(
        'MAX webhook is publicly exposed (PUBLIC_BASE_URL is set) but MAX_WEBHOOK_SECRET is empty — ' +
          'refusing all webhook calls until a secret is configured.'
      );
      return reply.code(503).send({ error: { code: 'service_unavailable', message: 'webhook secret not configured' } });
    }

    // Проверка секрета (раздел 7 ТЗ — "валидирует подпись/секрет"). По официальной документации
    // dev.max.ru (POST /subscriptions) MAX присылает секрет ТОЛЬКО в заголовке X-Max-Bot-Api-Secret
    // на каждом webhook-запросе.
    if (config.maxWebhookSecret) {
      const headerSecret = request.headers['x-max-bot-api-secret'];
      if (headerSecret !== config.maxWebhookSecret) {
        app.log.warn('MAX webhook: invalid or missing secret header');
        return reply.code(401).send({ error: { code: 'unauthorized', message: 'invalid webhook secret' } });
      }
    }

    const update = request.body as any;

    if (!update || typeof update.update_type !== 'string') {
      app.log.warn({ update_type: update?.update_type }, 'MAX webhook: malformed update, missing update_type');
      return reply.code(400).send({ error: { code: 'validation_error', message: 'missing update_type' } });
    }

    // Не логируем request.body целиком — он может содержать контакты кандидатов (телефон и т.п.),
    // а логи в проде обычно менее защищены, чем сама БД. Для отладки достаточно типа апдейта и chat_id.
    app.log.info({ update_type: update.update_type, chat_id: update.chat_id }, 'MAX update received');

    try {
      if (update.update_type === 'message_created') {
        // chat_id/user_id: по документации Update-объект несёт chat_id/user и на верхнем уровне,
        // и вложенно внутри message (message.recipient/message.sender) — пробуем оба варианта,
        // так как какой из них реально используется для message_created, не подтверждено вживую.
        const chatId = toStringId(update.message?.recipient?.chat_id ?? update.chat_id ?? update.message?.chat_id);
        const text = (update.message?.body?.text ?? update.message?.text ?? '').trim();
        const senderId = update.message?.sender?.user_id ?? update.user?.user_id ?? update.sender?.user_id;
        const senderName = update.message?.sender?.name ?? update.user?.name ?? update.sender?.name;

        if (chatId && senderId) {
          await upsertUser(String(senderId), String(chatId), senderName);

          if (text === '/новая_вакансия') {
            await startFlow(chatId, 'new_vacancy');
          } else if (text === '/отмена') {
            await cancelFlow(chatId);
          } else {
            // Порядок важен: сперва диалог создания вакансии, потом ожидание контакта после
            // отклика — это два независимых "состояния ожидания" для одного chatId.
            const dialogHandled = await handleAnswer(chatId, text);
            if (!dialogHandled) {
              const contact = extractContactFromMessage(update);
              const pendingHandled = await resolvePendingApplication(chatId, String(senderId), contact);
              if (!pendingHandled) {
                await maxApi.sendMessage(chatId, 'Напишите /новая_вакансия, чтобы создать вакансию.');
              }
            }
          }
        }
      }

      if (update.update_type === 'bot_started') {
        // Кандидат перешёл по deep link (https://max.ru/<bot>?start=apply_<id>) — это гарантированно
        // приватный чат с ботом, даже если исходная карточка вакансии была переслана в группу,
        // где бота нет и обычная inline-кнопка callback не сработала бы вовсе.
        const chatId = toStringId(update.chat_id);
        const senderId = update.user?.user_id;
        const senderName = update.user?.name;

        if (chatId && senderId) {
          await upsertUser(String(senderId), chatId, senderName);

          const vacancyId = parseDeepLinkApplyPayload(update.payload);
          if (vacancyId !== undefined) {
            await handleApplyClick(chatId, String(senderId), vacancyId);
          } else {
            await maxApi.sendMessage(
              chatId,
              'Привет! Я помогаю с сезонным наймом. Работодатели создают вакансии командой /новая_вакансия, ' +
                'а кандидаты откликаются по кнопке на карточке вакансии.'
            );
          }
        }
      }

      if (update.update_type === 'message_callback') {
        // Официальный SDK (context.ts) читает сообщение из update.message, а не из update.callback.message —
        // раньше здесь был обратный приоритет, из-за чего chat_id для нажатия кнопки мог не находиться.
        // Пользователь и payload самого нажатия по-прежнему берутся из update.callback.
        const chatId = toStringId(
            update.message?.recipient?.chat_id ?? update.chat_id ?? update.callback?.message?.recipient?.chat_id ?? update.callback?.chat_id
        );
        const payload = update.callback?.payload;
        const callbackId = update.callback?.callback_id;
        const senderId = update.callback?.user?.user_id ?? update.user?.user_id ?? update.callback?.sender?.user_id;
        const senderName = update.callback?.user?.name ?? update.user?.name ?? update.callback?.sender?.name;

        // Подтверждаем нажатие кнопки (POST /answers) — без этого MAX-клиент у пользователя
        // показывает "часики" на кнопке до таймаута. Best-effort: ошибка подтверждения не должна
        // ронять обработку самого нажатия (см. answerCallback в max/client.ts).
        if (callbackId) {
          maxApi.answerCallback(String(callbackId)).catch((err) => {
            app.log.warn(err, 'failed to acknowledge MAX callback (non-fatal)');
          });
        }

        if (chatId && senderId) {
          await upsertUser(String(senderId), String(chatId), senderName);
        }

        if (chatId && payload?.startsWith('apply:')) {
          const vacancyId = Number(payload.slice('apply:'.length));
          if (Number.isFinite(vacancyId) && senderId) {
            await handleApplyClick(chatId, String(senderId), vacancyId);
          }
        } else if (chatId && payload?.startsWith('app_status:')) {
          const [, applicationIdStr, status] = payload.split(':');
          const applicationId = Number(applicationIdStr);
          if (Number.isFinite(applicationId) && status && senderId) {
            // senderId передаём дальше — менять статус может только сам работодатель этой
            // вакансии, а не любой участник группового чата, где стоит бот (раздел 1.5 хендоффа).
            await handleStatusChangeFromChat(chatId, String(senderId), applicationId, status);
          }
        } else if (chatId && payload) {
          const handled = await handleAnswer(chatId, payload);
          if (!handled) {
            app.log.warn({ chatId, payload }, 'callback received but no active dialog session');
          }
        }
      }
    } catch (err) {
      app.log.error(err, 'failed to handle MAX update');
    }

    // Отвечаем 200 даже если внутренняя обработка упала (см. catch выше и лог с ошибкой) — это
    // осознанное решение, а не "заметание под ковёр": подтверждённый апдейт MAX не будет повторять
    // через retry, а реальная причина сбоя видна в логах (app.log.error). 400/401/503 выше — для
    // случаев, когда некорректен сам запрос, а не его обработка.
    // TODO (известное ограничение, не реализовано): полноценная дедупликация повторных апдейтов
    // по их id — MAX теоретически может доставить один апдейт дважды даже без ошибки на нашей
    // стороне, и без хранения обработанных id это продвинет диалог на лишний шаг. Возврат 200
    // выше убирает retry-storm от НАШИХ сбоев, но не защищает от дублирования на стороне MAX.
    reply.code(200).send({ ok: true });
  });
}
