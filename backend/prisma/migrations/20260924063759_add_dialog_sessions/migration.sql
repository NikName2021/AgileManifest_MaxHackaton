-- CreateTable
CREATE TABLE "dialog_sessions" (
    "chat_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dialog_sessions_pkey" PRIMARY KEY ("chat_id")
);
