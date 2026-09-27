-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "max_user_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "display_name" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacancies" (
    "id" SERIAL NOT NULL,
    "employer_user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "region_code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "card_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" SERIAL NOT NULL,
    "vacancy_id" INTEGER NOT NULL,
    "candidate_user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "contact" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_cache" (
    "region_code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "avg_salary_min" INTEGER,
    "avg_salary_max" INTEGER,
    "vacancy_count" INTEGER,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_cache_pkey" PRIMARY KEY ("region_code","category")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_max_user_id_key" ON "users"("max_user_id");

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_employer_user_id_fkey" FOREIGN KEY ("employer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_user_id_fkey" FOREIGN KEY ("candidate_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
