/*
  Read-only copies of Apptivo work order data, refreshed on every sync:
  - quote_subject: subject of the sales quote the work order was converted from
  - apptivo_quote_ref_id: the work order's fromObjectRefId

  Both are nullable; existing rows keep NULL until the next sync.
*/

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "apptivo_quote_ref_id" TEXT,
ADD COLUMN     "quote_subject" TEXT;
