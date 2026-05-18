
CREATE TYPE "LeadStatus" AS ENUM ('PENDING', 'CONTACTED', 'QUALIFIED', 'LOST');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "apptivo_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "reported_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "phone_number" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_apptivoId_key" ON "projects"("apptivo_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_email_key" ON "leads"("email");
