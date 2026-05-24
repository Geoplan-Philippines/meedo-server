/*
  Warnings:

  - Made the column `message` on table `leads` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('LEAD', 'MEMBER');

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "message" SET NOT NULL;

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "team_id" TEXT,
ADD COLUMN     "team_role" "TeamRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "members_team_id_idx" ON "members"("team_id");

-- CreateIndex
CREATE INDEX "teams_is_archived_idx" ON "teams"("is_archived");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
