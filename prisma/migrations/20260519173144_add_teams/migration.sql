/*
  Warnings:

  - You are about to drop the `tickets` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "tickets";

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- RenameIndex
ALTER INDEX "projects_apptivoId_key" RENAME TO "projects_apptivo_id_key";
