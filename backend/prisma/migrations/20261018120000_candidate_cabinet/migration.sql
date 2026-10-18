-- Кабинет работника: сохранённый контакт для отклика и личный чат с ботом (только аддитивные изменения,
-- существующие пользователи/вакансии/отклики не трогаются).
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "application_contact" TEXT,
ADD COLUMN     "dialog_chat_id" TEXT;

-- CreateIndex
CREATE INDEX "vacancies_status_created_at_id_idx" ON "vacancies"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "applications_candidate_user_id_created_at_id_idx" ON "applications"("candidate_user_id", "created_at" DESC, "id" DESC);
