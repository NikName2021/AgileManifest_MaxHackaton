-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "viewed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vacancies" ADD COLUMN     "closed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "application_events" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_events_application_id_created_at_idx" ON "application_events"("application_id", "created_at");

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Существующие отклики: точной истории нет, восстанавливаем то, что известно.
INSERT INTO "application_events" ("application_id", "type", "created_at")
SELECT "id", 'applied', "created_at" FROM "applications";

INSERT INTO "application_events" ("application_id", "type", "created_at")
SELECT "id", 'status:' || "status", COALESCE(CASE WHEN "status" = 'hired' THEN "hired_at" END, "updated_at")
FROM "applications" WHERE "status" <> 'new';

UPDATE "applications" SET "viewed_at" = "updated_at" WHERE "status" <> 'new';
