/*
  Warnings:

  - A unique constraint covering the columns `[vacancy_id,candidate_user_id]` on the table `applications` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "applications_vacancy_id_candidate_user_id_key" ON "applications"("vacancy_id", "candidate_user_id");
