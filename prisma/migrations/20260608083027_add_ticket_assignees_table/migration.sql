/*
  Warnings:

  - You are about to drop the column `assignee_id` on the `tickets` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_assignee_id_fkey";

-- DropForeignKey
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_ticket_status_id_fkey";

-- DropIndex
DROP INDEX "tickets_assignee_id_idx";

-- AlterTable
ALTER TABLE "tickets" DROP COLUMN "assignee_id",
ALTER COLUMN "ticket_status_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ticket_assignees" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_assignees_ticket_id_idx" ON "ticket_assignees"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_assignees_member_id_idx" ON "ticket_assignees"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_assignees_ticket_id_member_id_key" ON "ticket_assignees"("ticket_id", "member_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_status_id_fkey" FOREIGN KEY ("ticket_status_id") REFERENCES "ticket_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
