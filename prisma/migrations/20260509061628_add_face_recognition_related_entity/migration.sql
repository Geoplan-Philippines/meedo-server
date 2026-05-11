CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "FaceProfileStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'NEEDS_REENROLLMENT');

-- CreateEnum
CREATE TYPE "FaceEmbeddingProvider" AS ENUM ('DEEPFACE', 'INSIGHTFACE');

-- CreateEnum
CREATE TYPE "FaceEmbeddingModel" AS ENUM ('ARCFACE', 'FACENET', 'VGG_FACE');

-- CreateTable
CREATE TABLE "face_profiles" (
    "id" TEXT NOT NULL,
    "status" "FaceProfileStatus" NOT NULL DEFAULT 'PENDING',
    "enrolled_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_embeddings" (
    "id" TEXT NOT NULL,
    "provider" "FaceEmbeddingProvider" NOT NULL DEFAULT 'DEEPFACE',
    "model" "FaceEmbeddingModel" NOT NULL,
    "embedding" vector NOT NULL,
    "image_url" TEXT,
    "quality_score" DOUBLE PRECISION,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "organization_id" TEXT NOT NULL,
    "face_profile_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "face_profiles_organization_id_idx" ON "face_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "face_profiles_user_id_idx" ON "face_profiles"("user_id");

-- CreateIndex
CREATE INDEX "face_profiles_status_idx" ON "face_profiles"("status");

-- CreateIndex
CREATE INDEX "face_embeddings_organization_id_idx" ON "face_embeddings"("organization_id");

-- CreateIndex
CREATE INDEX "face_embeddings_face_profile_id_idx" ON "face_embeddings"("face_profile_id");

-- CreateIndex
CREATE INDEX "face_embeddings_provider_model_idx" ON "face_embeddings"("provider", "model");

-- CreateIndex
CREATE INDEX "face_embeddings_is_archived_idx" ON "face_embeddings"("is_archived");

-- AddForeignKey
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_embeddings" ADD CONSTRAINT "face_embeddings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_embeddings" ADD CONSTRAINT "face_embeddings_face_profile_id_fkey" FOREIGN KEY ("face_profile_id") REFERENCES "face_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
