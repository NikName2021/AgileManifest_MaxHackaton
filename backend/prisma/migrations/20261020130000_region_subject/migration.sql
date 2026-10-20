-- AlterTable
ALTER TABLE "vacancies" ADD COLUMN     "region_subject" TEXT;


-- Существующие записи заполняет backfillRegionSubjects() при старте backend: распознавание — в коде, а не в SQL.
