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

// TODO: точная структура вложения для нажатия кнопки request_contact не подтверждена живым
// тестом — предположение по типовому шаблону контакт-ботов. Если не сработает на живом MAX,
// у кандидата всегда есть фолбэк — просто написать контакт текстом (обрабатывается тем же путём).
function extractContactFromMessage(update: any): string | undefined {
    const text = (update.message?.body?.text ?? update.message?.text ?? '').trim();
    if (text) return text;

    const attachments = update.message?.body?.attachments ?? [];
    const contactAttachment = attachments.find((a: any) => a?.type === 'contact');
    const phone = contactAttachment?.payload?.vcf_phone ?? contactAttachment?.payload?.phone;
    return phone ? String(phone) : undefined;
}

export function registerMaxWebhook(app: FastifyInstance) {
  app.post('/webhook/max', async (request, reply) => {
    // Проверка секрета (раздел 7 ТЗ — "валидирует подпись/секрет"). Точный механизм, которым MAX
    // подтверждает подлинность вебхука (заголовок/подпись), не подтверждён документацией на момент
    // написания — поэтому используем гарантированно рабочий вариант: секрет зашит в сам URL вебхука
    // при регистрации подписки (см. server.ts) и сверяется здесь как query-параметр.
    if (config.maxWebhookSecret) {
      const providedSecret = (request.query as any)?.secret;
      if (providedSecret !== config.maxWebhookSecret) {
        app.log.warn('MAX webhook: invalid or missing secret in request');
        return reply.code(401).send({ ok: false, error: 'invalid webhook secret' });
      }
    }

    app.log.info({ body: request.body }, 'MAX update received');

    const update = request.body as any;

    try {
      if (update?.update_type === 'message_created') {
        // TODO: поля sender/chat_id — предположение по типовой структуре, сверить с реальным payload
        const chatId = toStringId(update.message?.recipient?.chat_id ?? update.message?.chat_id);
        const text = (update.message?.body?.text ?? update.message?.text ?? '').trim();
        const senderId = update.message?.sender?.user_id ?? update.sender?.user_id;
        const senderName = update.message?.sender?.name ?? update.sender?.name;

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

      if (update?.update_type === 'message_callback') {
        // TODO: реальные пути для chat_id/payload/user — сверить на первом живом нажатии кнопки
        const chatId = toStringId(update.callback?.message?.recipient?.chat_id ?? update.callback?.chat_id);
        const payload = update.callback?.payload;
        const senderId = update.callback?.user?.user_id ?? update.callback?.sender?.user_id;
        const senderName = update.callback?.user?.name ?? update.callback?.sender?.name;

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
          if (Number.isFinite(applicationId) && status) {
            await handleStatusChangeFromChat(chatId, applicationId, status);
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

    reply.code(200).send({ ok: true });
  });
}
