/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,apptivo_id]` on the table `projects` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "projects_apptivo_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_apptivo_id_key" ON "projects"("organization_id", "apptivo_id");
