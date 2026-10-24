-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "notified_at" TIMESTAMP(3),
ADD COLUMN     "notified_status" TEXT,
ADD COLUMN     "pending_notify_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "applications_pending_notify_at_idx" ON "applications"("pending_notify_at");


-- «Подходит студентам» больше не бейдж, а отдельная отметка: переносим старые ключи во флаг.
UPDATE "vacancies"
SET "student_friendly" = true, "badges" = array_remove("badges", 'students_ok')
WHERE 'students_ok' = ANY("badges");

UPDATE "partner_channels"
SET "student_only" = true, "badges" = array_remove("badges", 'students_ok')
WHERE 'students_ok' = ANY("badges");

-- Уже отправленные уведомления об этапах не повторяем после выката: считаем текущий этап сообщённым.
UPDATE "applications"
SET "notified_status" = "status", "notified_at" = "updated_at"
WHERE "status" IN ('contacted', 'invited', 'hired', 'rejected');
