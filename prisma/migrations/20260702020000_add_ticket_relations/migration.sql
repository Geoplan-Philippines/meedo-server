-- Symmetric ticket-to-ticket links. Each pair is stored as two mirrored rows
-- (A→B and B→A) so either ticket can list the other; ON DELETE CASCADE clears a
-- ticket's links when it is removed.

-- CreateTable
CREATE TABLE "ticket_relations" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "related_ticket_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_relations_ticket_id_idx" ON "ticket_relations"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_relations_related_ticket_id_idx" ON "ticket_relations"("related_ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_relations_ticket_id_related_ticket_id_key" ON "ticket_relations"("ticket_id", "related_ticket_id");

-- AddForeignKey
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_related_ticket_id_fkey" FOREIGN KEY ("related_ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
