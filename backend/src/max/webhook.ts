import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { maxApi } from './client.js';

export function registerMaxWebhook(app: FastifyInstance) {
  app.post('/webhook/max', async (request, reply) => {
    // TODO: как только увидите реальные заголовки от MAX, проверить секрет/подпись здесь.
    // Пока — просто лог, чтобы увидеть форму данных.
    app.log.info({ body: request.body }, 'MAX update received');

    const update = request.body as any;

    try {
      if (update?.update_type === 'message_created') {
        const chatId = update.message?.recipient?.chat_id ?? update.message?.chat_id;
        const text = update.message?.body?.text ?? update.message?.text;
        app.log.info({ chatId, text }, 'incoming text message');

        if (chatId) {
          // Заглушка — сюда подключим Dialog Engine на следующем шаге
          await maxApi.sendMessage(chatId, 'Привет! Скоро я научусь принимать вакансии 🙂');
        }
      }

      if (update?.update_type === 'message_callback') {
        app.log.info({ payload: update.callback?.payload }, 'button pressed');
        // TODO: обработка смены статуса воронки
      }
    } catch (err) {
      app.log.error(err, 'failed to handle MAX update');
    }

    // MAX ждёт быстрый 200 OK, иначе будет ретраить доставку
    reply.code(200).send({ ok: true });
  });
}