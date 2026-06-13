-- CreateEnum
CREATE TYPE "TicketActivityType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ASSIGNEE_CHANGED', 'PRIORITY_CHANGED', 'COMMENTED', 'ARCHIVED', 'RESTORED');

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_member_id" TEXT,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_activities" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "actor_member_id" TEXT,
    "type" "TicketActivityType" NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_comments_ticket_id_idx" ON "ticket_comments"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_comments_author_member_id_idx" ON "ticket_comments"("author_member_id");

-- CreateIndex
CREATE INDEX "ticket_activities_ticket_id_idx" ON "ticket_activities"("ticket_id");

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
