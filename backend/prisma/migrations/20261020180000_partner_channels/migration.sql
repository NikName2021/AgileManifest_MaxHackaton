-- CreateTable
CREATE TABLE "partner_channels" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "title" TEXT,
    "is_channel" BOOLEAN NOT NULL DEFAULT false,
    "owner_user_id" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "region_subject" TEXT,
    "student_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "partner_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_deliveries" (
    "vacancy_id" INTEGER NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_deliveries_pkey" PRIMARY KEY ("vacancy_id","channel_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_channels_chat_id_key" ON "partner_channels"("chat_id");

-- AddForeignKey
ALTER TABLE "partner_channels" ADD CONSTRAINT "partner_channels_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

