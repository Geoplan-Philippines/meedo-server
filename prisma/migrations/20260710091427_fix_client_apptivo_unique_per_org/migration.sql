/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,apptivo_id]` on the table `clients` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "clients_apptivo_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "clients_organization_id_apptivo_id_key" ON "clients"("organization_id", "apptivo_id");
