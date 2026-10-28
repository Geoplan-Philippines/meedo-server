-- CreateEnum
CREATE TYPE "NewsletterCampaignStatus" AS ENUM ('DRAFT', 'ARCHIVED');

-- CreateTable
CREATE TABLE "newsletter_campaigns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NewsletterCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_member_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "newsletter_campaigns_organization_id_status_idx" ON "newsletter_campaigns"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
