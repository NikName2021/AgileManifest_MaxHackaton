-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "hired_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "team_invites" (
    "id" SERIAL NOT NULL,
    "vacancy_id" INTEGER NOT NULL,
    "candidate_user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_marks" (
    "employer_user_id" INTEGER NOT NULL,
    "candidate_user_id" INTEGER NOT NULL,
    "reliable" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_marks_pkey" PRIMARY KEY ("employer_user_id","candidate_user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_invites_vacancy_id_candidate_user_id_key" ON "team_invites"("vacancy_id", "candidate_user_id");

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_candidate_user_id_fkey" FOREIGN KEY ("candidate_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_marks" ADD CONSTRAINT "team_marks_employer_user_id_fkey" FOREIGN KEY ("employer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_marks" ADD CONSTRAINT "team_marks_candidate_user_id_fkey" FOREIGN KEY ("candidate_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Точного момента найма у старых записей нет — берём последнее изменение отклика.
UPDATE "applications" SET "hired_at" = "updated_at" WHERE "status" = 'hired';
