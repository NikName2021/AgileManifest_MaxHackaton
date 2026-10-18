import { execSync } from 'node:child_process';

// Применяет миграции к тестовой БД тем же способом, что и прод-контейнер (prisma migrate deploy):
// так тесты заодно проверяют, что миграции накатываются на чистую базу. Prisma сама создаёт базу,
// если её ещё нет. Имя базы уже проверено в vitest.config.ts (должно заканчиваться на _test).
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
