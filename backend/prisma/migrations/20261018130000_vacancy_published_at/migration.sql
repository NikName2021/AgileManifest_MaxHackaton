-- AlterTable
ALTER TABLE "vacancies" ADD COLUMN     "published_at" TIMESTAMP(3);

-- Уже опубликованные/закрытые вакансии: точного момента публикации нет, берём created_at
-- (так напоминания считались до этой миграции).
UPDATE "vacancies" SET "published_at" = "created_at" WHERE "status" <> 'draft';
