-- One level of threaded replies on ticket comments. A reply points at its
-- top-level parent via parent_id; deleting a comment cascades to its replies.

-- AlterTable
ALTER TABLE "ticket_comments" ADD COLUMN "parent_id" TEXT;

-- CreateIndex
CREATE INDEX "ticket_comments_parent_id_idx" ON "ticket_comments"("parent_id");

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ticket_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
