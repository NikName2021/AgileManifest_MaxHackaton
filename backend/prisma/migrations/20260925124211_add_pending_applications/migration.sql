-- CreateTable
CREATE TABLE "pending_applications" (
    "chat_id" TEXT NOT NULL,
    "vacancy_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_applications_pkey" PRIMARY KEY ("chat_id")
);
