-- AlterTable
ALTER TABLE "vacancies" ADD COLUMN     "badges" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "vacancies_badges_idx" ON "vacancies" USING GIN ("badges");

