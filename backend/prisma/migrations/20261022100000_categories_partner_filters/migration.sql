-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "partner_channel_id" INTEGER;

-- AlterTable
ALTER TABLE "partner_channels" ADD COLUMN     "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "digest_hour" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "last_digest_at" TIMESTAMP(3),
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'instant',
ADD COLUMN     "salary_from" INTEGER,
ADD COLUMN     "schedule" TEXT,
ADD COLUMN     "trusted_only" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "pending_applications" ADD COLUMN     "partner_channel_id" INTEGER;

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "norm_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_norm_key_key" ON "categories"("norm_key");

-- CreateIndex
CREATE INDEX "applications_partner_channel_id_idx" ON "applications"("partner_channel_id");


-- Сферы из уже созданных вакансий — чтобы их сразу предлагали при вводе (встроенные сферы живут в коде).
INSERT INTO "categories" ("name", "norm_key")
SELECT DISTINCT ON (k) name, k
FROM (
  SELECT btrim(category) AS name, lower(replace(replace(btrim(category), 'Ё', 'Е'), 'ё', 'е')) AS k
  FROM "vacancies"
  WHERE category <> 'general' AND btrim(category) <> ''
) s
ORDER BY k, name
ON CONFLICT ("norm_key") DO NOTHING;
