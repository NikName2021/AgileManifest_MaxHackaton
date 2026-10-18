import { execSync } from 'node:child_process';

// Миграции — как в прод-контейнере (migrate deploy). Prisma создаёт базу, если её нет.
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
