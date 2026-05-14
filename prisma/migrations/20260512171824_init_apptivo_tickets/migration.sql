-- AlterTable
ALTER TABLE "face_profiles" ALTER COLUMN "enrolled_at" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Ticket" (
    "id" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "reportedDate" TEXT NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);
