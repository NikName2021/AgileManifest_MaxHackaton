import type { FastifyInstance } from 'fastify';
import { maxApi } from './client.js';
import { upsertUser } from '../users/service.js';
import { startFlow, cancelFlow, handleAnswer } from '../dialog/engine.js';

export function registerMaxWebhook(app: FastifyInstance) {
  app.post('/webhook/max', async (request, reply) => {
    app.log.info({ body: request.body }, 'MAX update received');

    const update = request.body as any;

    try {
      if (update?.update_type === 'message_created') {
        // TODO: поля sender/chat_id — предположение по типовой структуре, сверить с реальным payload
        const chatId = update.message?.recipient?.chat_id ?? update.message?.chat_id;
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
            const handled = await handleAnswer(chatId, text);
            if (!handled) {
              await maxApi.sendMessage(chatId, 'Напишите /новая_вакансия, чтобы создать вакансию.');
            }
          }
        }
      }

      if (update?.update_type === 'message_callback') {
        // TODO: реальные пути для chat_id/payload/user — сверить на первом живом нажатии кнопки
        const chatId = update.callback?.message?.recipient?.chat_id ?? update.callback?.chat_id;
        const payload = update.callback?.payload;

        if (chatId && payload) {
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