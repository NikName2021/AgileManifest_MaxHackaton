import Fastify from 'fastify';
import { config } from './config.js';
import { maxApi } from './max/client.js';
import { registerMaxWebhook } from './max/webhook.js';
import { db } from './db.js';

const app = Fastify({ logger: true });

registerMaxWebhook(app);

// Служебный healthcheck — пригодится и для Docker, и для проверки, что backend жив
app.get('/health', async () => ({ ok: true }));

// Пример: список вакансий работодателя (backend API из раздела 6 ТЗ) — заглушка
app.get('/api/vacancies', async (request) => {
  const employerId = (request.query as any)?.employer_id;
  return db.vacancy.findMany({
    where: employerId ? { employerUserId: Number(employerId) } : undefined,
  });
});

async function start() {
  try {
    const me = await maxApi.getMe();
    await maxApi.registerCommands([
      { name: 'новая_вакансия', description: 'Создать вакансию' },
      { name: 'отмена', description: 'Отменить текущий диалог' },
    ]);
    app.log.info({ me }, 'connected to MAX as bot');
  } catch (err) {
    app.log.error(err, 'failed to reach MAX API — проверьте MAX_BOT_TOKEN');
  }

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start();