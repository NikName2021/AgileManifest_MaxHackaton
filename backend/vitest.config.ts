import { defineConfig } from 'vitest/config';

// Тесты очищают таблицы перед каждым сценарием — имя базы обязано заканчиваться на _test.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required, e.g. postgresql://user:pass@localhost:5446/hiring_test?schema=public');
}
const dbName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
if (!dbName.endsWith('_test')) {
  throw new Error(`refusing to run tests against database "${dbName}": its name must end with _test`);
}

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    // Файлы делят одну БД.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // Заданы явно, чтобы dotenv не подтянул значения из backend/.env. Секреты фиктивные.
    env: {
      DATABASE_URL: testDatabaseUrl,
      MAX_BOT_TOKEN: 'test-bot-token',
      MAX_API_BASE_URL: 'http://max.invalid',
      MAX_WEBHOOK_SECRET: 'test-webhook-secret',
      PUBLIC_BASE_URL: '',
      SESSION_SECRET: 'test-session-secret',
      TEST_API_TOKEN: '',
      MAX_BOT_USERNAME: '',
      FRONTEND_ORIGIN: '',
    },
  },
});
