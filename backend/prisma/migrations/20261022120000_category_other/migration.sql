-- AlterTable
ALTER TABLE "vacancies" ADD COLUMN     "category_detail" TEXT;

-- DropTable
DROP TABLE "categories";

-- CreateTable
CREATE TABLE "category_misses" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "norm_key" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_misses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_misses_norm_key_key" ON "category_misses"("norm_key");

