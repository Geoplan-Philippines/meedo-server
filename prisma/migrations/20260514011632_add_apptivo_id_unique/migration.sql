/*
  Warnings:

  - The primary key for the `Ticket` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `reportedDate` column on the `Ticket` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[apptivoId]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `apptivoId` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_pkey",
ADD COLUMN     "apptivoId" TEXT NOT NULL,
ALTER COLUMN "id" SET DATA TYPE TEXT,
DROP COLUMN "reportedDate",
ADD COLUMN     "reportedDate" TIMESTAMP(3),
ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_apptivoId_key" ON "Ticket"("apptivoId");
