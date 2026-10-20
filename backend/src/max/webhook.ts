import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { maxApi } from './client.js';
import { config } from '../config.js';
import { upsertUser } from '../users/service.js';
import { startFlow, cancelFlow, handleAnswer } from '../dialog/engine.js';
import { handleApplyClick, resolvePendingApplication, handleStatusChangeFromChat, type ApplicationSource } from '../application/service.js';
import { handleTeamInviteResponse } from '../team/service.js';
import { handleDraftDecision } from '../dialog/preview.js';
import { subscribeLike, unsubscribe } from '../subscriptions/service.js';

// Сравнение за постоянное время; хеши уравнивают длину.
function secretsEqual(received: unknown, expected: string): boolean {
    if (typeof received !== 'string') return false;
    const a = createHash('sha256').update(received).digest();
    const b = createHash('sha256').update(expected).digest();
    return timingSafeEqual(a, b);
}

// MAX присылает id и числом, и строкой; в БД это String.
function toStringId(raw: unknown): string | undefined {
    return raw !== undefined && raw !== null ? String(raw) : undefined;
}

// Вложение контакта приходит vCard-текстом (payload.vcf_info) — достаём строку TEL...:<номер>.
function extractPhoneFromVcf(vcf: string): string | undefined {
    const match = /^TEL[^:\n]*:(.+)$/im.exec(vcf);
    if (!match) return undefined;
    const phone = match[1].trim();
    return phone || undefined;
}

// TODO: формат вложения от кнопки request_contact не проверен живым вызовом.
// Фолбэк — кандидат пишет контакт текстом.
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

    // Непроверенные поля на случай другого формата.
    const legacyPhone = contactAttachment?.payload?.vcf_phone ?? contactAttachment?.payload?.phone;
    if (legacyPhone) return String(legacyPhone);

    // Только contact_id без телефона — номер не извлечь, resolvePendingApplication переспросит.
    return undefined;
}

// Payload deep link — "apply_123" без двоеточия: отличается от callback-кнопки "apply:123"
// и не зависит от кодирования спецсимволов в start=.
const LINK_SOURCES: Record<string, ApplicationSource> = { qr: 'qr', sub: 'subscription', ch: 'channel' };

function parseDeepLinkApplyPayload(payload: unknown): { vacancyId: number; source: ApplicationSource } | undefined {
    if (typeof payload !== 'string') return undefined;
    const match = /^apply_(\d+)(?:_([a-z]+))?$/.exec(payload);
    if (!match) return undefined;
    const vacancyId = Number(match[1]);
    if (!Number.isFinite(vacancyId)) return undefined;
    return { vacancyId, source: (match[2] && LINK_SOURCES[match[2]]) || 'link' };
}

export function registerMaxWebhook(app: FastifyInstance) {
  app.post('/webhook/max', async (request, reply) => {
    // Публичный вебхук без секрета был бы открыт любому, кто узнает URL — отказываем всем.
    if (config.publicBaseUrl && !config.maxWebhookSecret) {
      app.log.error(
        'MAX webhook is publicly exposed (PUBLIC_BASE_URL is set) but MAX_WEBHOOK_SECRET is empty — ' +
          'refusing all webhook calls until a secret is configured.'
      );
      return reply.code(503).send({ error: { code: 'service_unavailable', message: 'webhook secret not configured' } });
    }

    // MAX присылает секрет подписки в заголовке X-Max-Bot-Api-Secret.
    if (config.maxWebhookSecret) {
      const headerSecret = request.headers['x-max-bot-api-secret'];
      if (!secretsEqual(headerSecret, config.maxWebhookSecret)) {
        app.log.warn('MAX webhook: invalid or missing secret header');
        return reply.code(401).send({ error: { code: 'unauthorized', message: 'invalid webhook secret' } });
      }
    }

    const update = request.body as any;

    if (!update || typeof update.update_type !== 'string') {
      app.log.warn({ update_type: update?.update_type }, 'MAX webhook: malformed update, missing update_type');
      return reply.code(400).send({ error: { code: 'validation_error', message: 'missing update_type' } });
    }

    // Тело не логируем: в нём могут быть контакты кандидатов.
    app.log.info({ update_type: update.update_type, chat_id: update.chat_id }, 'MAX update received');

    try {
      if (update.update_type === 'message_created') {
        // Какие поля реально заполнены в message_created, вживую не подтверждено — пробуем оба места.
        const chatId = toStringId(update.message?.recipient?.chat_id ?? update.chat_id ?? update.message?.chat_id);
        const text = (update.message?.body?.text ?? update.message?.text ?? '').trim();
        const senderId = update.message?.sender?.user_id ?? update.user?.user_id ?? update.sender?.user_id;
        const senderName = update.message?.sender?.name ?? update.user?.name ?? update.sender?.name;

        if (chatId && senderId) {
          await upsertUser(String(senderId), String(chatId), senderName);

          if (text === '/новая_вакансия') {
            await startFlow(chatId, 'new_vacancy', String(senderId));
          } else if (text === '/отмена') {
            await cancelFlow(chatId);
          } else if (text === '/отписаться') {
            await unsubscribe(chatId, String(senderId), 'all');
          } else {
            // Сначала диалог создания вакансии, потом ожидание контакта после отклика.
            const dialogHandled = await handleAnswer(chatId, String(senderId), text);
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
        // Deep link и «Начать» всегда открывают личный чат с ботом — поэтому isDialog.
        const chatId = toStringId(update.chat_id);
        const senderId = update.user?.user_id;
        const senderName = update.user?.name;

        if (chatId && senderId) {
          await upsertUser(String(senderId), chatId, senderName, { isDialog: true });

          const deepLink = parseDeepLinkApplyPayload(update.payload);
          if (deepLink) {
            await handleApplyClick(chatId, String(senderId), deepLink.vacancyId, deepLink.source);
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
        // Как в официальном SDK: сообщение — из update.message, пользователь и payload — из update.callback.
        const chatId = toStringId(
            update.message?.recipient?.chat_id ?? update.chat_id ?? update.callback?.message?.recipient?.chat_id ?? update.callback?.chat_id
        );
        const payload = update.callback?.payload;
        const callbackId = update.callback?.callback_id;
        const senderId = update.callback?.user?.user_id ?? update.user?.user_id ?? update.callback?.sender?.user_id;
        const senderName = update.callback?.user?.name ?? update.user?.name ?? update.callback?.sender?.name;

        if (callbackId) {
          maxApi.answerCallback(String(callbackId)).catch((err) => {
            app.log.warn(err, 'failed to acknowledge MAX callback (non-fatal)');
          });
        }

        if (chatId && senderId) {
          await upsertUser(String(senderId), String(chatId), senderName);
        }

        if (chatId && payload?.startsWith('apply:')) {
          // apply:<id> — кнопка на карточке, apply:<id>:sub — в рассылке по подписке.
          const [, idStr, tag] = payload.split(':');
          const vacancyId = Number(idStr);
          if (Number.isFinite(vacancyId) && senderId) {
            await handleApplyClick(chatId, String(senderId), vacancyId, tag === 'sub' ? 'subscription' : 'card');
          }
        } else if (chatId && senderId && /^subscribe_like:\d+$/.test(payload ?? '')) {
          await subscribeLike(chatId, String(senderId), Number(payload.split(':')[1]));
        } else if (chatId && senderId && /^unsub:\d+$/.test(payload ?? '')) {
          await unsubscribe(chatId, String(senderId), Number(payload.split(':')[1]));
        } else if (chatId && payload?.startsWith('app_status:')) {
          const [, applicationIdStr, status] = payload.split(':');
          const applicationId = Number(applicationIdStr);
          if (Number.isFinite(applicationId) && status && senderId) {
            await handleStatusChangeFromChat(chatId, String(senderId), applicationId, status);
          }
        } else if (chatId && senderId && /^draft_(publish|keep):\d+$/.test(payload ?? '')) {
          const [action, idStr] = payload.slice('draft_'.length).split(':');
          await handleDraftDecision(chatId, String(senderId), Number(idStr), action);
        } else if (chatId && payload?.startsWith('team_invite:')) {
          const [, inviteIdStr, answer] = payload.split(':');
          const inviteId = Number(inviteIdStr);
          if (Number.isFinite(inviteId) && answer && senderId) {
            await handleTeamInviteResponse(chatId, String(senderId), inviteId, answer);
          }
        } else if (chatId && payload) {
          const handled = await handleAnswer(chatId, senderId ? String(senderId) : undefined, payload);
          if (!handled) {
            app.log.warn({ chatId, payload }, 'callback received but no active dialog session');
          }
        }
      }
    } catch (err) {
      app.log.error(err, 'failed to handle MAX update');
    }

    // 200 и при сбое обработки (он в логе): иначе MAX повторял бы апдейт.
    // TODO: дедупликации апдейтов по id нет — повторная доставка продвинет диалог на лишний шаг.
    reply.code(200).send({ ok: true });
  });
}
