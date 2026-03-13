-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'STAFF');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'ONLINE',
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "firstName" DROP NOT NULL,
ALTER COLUMN "surname" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Booking_startTime_idx" ON "Booking"("startTime");

-- CreateIndex
CREATE INDEX "Booking_source_startTime_idx" ON "Booking"("source", "startTime");
