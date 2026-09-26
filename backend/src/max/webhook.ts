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
    // Проверка секрета (раздел 7 ТЗ — "валидирует подпись/секрет"). По официальной документации
    // dev.max.ru (POST /subscriptions) MAX присылает секрет ТОЛЬКО в заголовке X-Max-Bot-Api-Secret
    // на каждом webhook-запросе. Раньше здесь также принимался query-параметр ?secret= как "запасной
    // канал" — убрали: он не подтверждён документацией, никогда не устанавливается самим MAX,
    // и мог случайно засветить секрет в логах прокси/туннеля (см. также server.ts — секрет больше
    // не зашивается в URL подписки).
    if (config.maxWebhookSecret) {
      const headerSecret = request.headers['x-max-bot-api-secret'];
      if (headerSecret !== config.maxWebhookSecret) {
        app.log.warn('MAX webhook: invalid or missing secret header');
        return reply.code(401).send({ ok: false, error: 'invalid webhook secret' });
      }
    }

    const update = request.body as any;

    if (!update || typeof update.update_type !== 'string') {
      app.log.warn({ update_type: update?.update_type }, 'MAX webhook: malformed update, missing update_type');
      return reply.code(400).send({ ok: false, error: 'missing update_type' });
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
        // TODO: структура объекта callback (payload/callback_id) официальной документацией не
        // подтверждена — chat_id/user_id пробуем и вложенно, и на верхнем уровне Update (см. выше).
        const chatId = toStringId(update.callback?.message?.recipient?.chat_id ?? update.chat_id ?? update.callback?.chat_id);
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

    // Отвечаем 200 даже если внутренняя обработка упала (см. catch выше и лог с ошибкой) — это
    // осознанное решение, а не "заметание под ковёр": подтверждённый апдейт MAX не будет повторять
    // через retry, а реальная причина сбоя видна в логах (app.log.error). 400/401 выше — для
    // случаев, когда некорректен сам запрос (не тот secret, нет update_type), а не его обработка.
    reply.code(200).send({ ok: true });
  });
}
