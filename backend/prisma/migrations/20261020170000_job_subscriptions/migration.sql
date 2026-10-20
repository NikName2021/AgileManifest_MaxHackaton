-- CreateTable
CREATE TABLE "job_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "region_subject" TEXT,
    "category" TEXT,
    "schedule" TEXT,
    "salary_from" INTEGER,
    "student_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_deliveries" (
    "vacancy_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_deliveries_pkey" PRIMARY KEY ("vacancy_id","user_id")
);

-- CreateIndex
CREATE INDEX "job_subscriptions_user_id_idx" ON "job_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "job_subscriptions" ADD CONSTRAINT "job_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

