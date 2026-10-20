-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "attendance" TEXT,
ADD COLUMN     "attendance_reminder_sent_at" TIMESTAMP(3),
ADD COLUMN     "shift_note" TEXT,
ADD COLUMN     "start_at" TIMESTAMP(3);

