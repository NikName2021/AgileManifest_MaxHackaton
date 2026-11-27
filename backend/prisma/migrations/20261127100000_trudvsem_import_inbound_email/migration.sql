-- AlterTable
ALTER TABLE "users" ADD COLUMN     "company_inn" TEXT,
ADD COLUMN     "inbound_email_token" TEXT;

-- AlterTable
ALTER TABLE "vacancies" ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "external_source" TEXT,
ADD COLUMN     "external_url" TEXT;

-- CreateTable
CREATE TABLE "inbound_emails" (
    "id" SERIAL NOT NULL,
    "message_id" TEXT NOT NULL,
    "employer_user_id" INTEGER,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "application_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_emails_message_id_key" ON "inbound_emails"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_inbound_email_token_key" ON "users"("inbound_email_token");

-- CreateIndex
CREATE UNIQUE INDEX "vacancies_employer_user_id_external_source_external_id_key" ON "vacancies"("employer_user_id", "external_source", "external_id");

