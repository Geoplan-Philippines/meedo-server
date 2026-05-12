import { ConfigService } from '@nestjs/config';
import { Injectable, InternalServerErrorException, RequestTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { CreateFaceProfileDTO } from './dto/create-face-profile.dto';
import { CreateFaceEmbeddingDTO } from './dto/create-face-embedding.dto';
import { FaceEmbedding, FaceProfile } from '@prisma/client';
import type { User } from 'better-auth';

type PythonEmbedResponse = {
  embedding: number[];
};

interface SimilarityRow {
  similarity: number;
}

interface RecognizeResult {
  matched: boolean;       // true if face is recognized
  similarity: number;     // e.g. 0.87 (for debugging / logging)
  threshold: number;      // e.g. 0.80 (so the client knows what bar was used)
}

@Injectable()
export class FaceService {
  constructor(
    private prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createFaceProfile(payload: CreateFaceProfileDTO): Promise<FaceProfile> {
    return this.prisma.faceProfile.create({
      data: payload,
    });
  }

  async findAllFaceProfiles(): Promise<FaceProfile[]> {
    return this.prisma.faceProfile.findMany();
  }

  async findAllFaceEmbeddings(): Promise<FaceEmbedding[]> {
    return this.prisma.faceEmbedding.findMany();
  }

  async findMyFaceProfiles(userId: string, organizationId: string) {
    return this.prisma.faceProfile.findMany({
      where: { userId, organizationId },
      include: {
        faceEmbeddings: {
          select: {
            id: true,
            provider: true,
            model: true,
            imageUrl: true,
            qualityScore: true,
            isArchived: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async createFaceEmbedding(payload: CreateFaceEmbeddingDTO): Promise<FaceEmbedding> {
    const vector = `[${payload.embedding.join(',')}]`;

    const [row] = await this.prisma.$queryRaw<FaceEmbedding[]>`
      INSERT INTO face_embeddings (
        id, provider, model, embedding, image_url, quality_score, is_archived, organization_id, face_profile_id, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        ${payload.provider ?? 'DEEPFACE'}::"FaceEmbeddingProvider",
        ${payload.model}::"FaceEmbeddingModel",
        ${vector}::vector(512),
        ${payload.imageUrl ?? null},
        ${payload.qualityScore ?? null},
        ${payload.isArchived ?? false},
        ${payload.organizationId},
        ${payload.faceProfileId},
        NOW(), 
        NOW()
      )
      RETURNING
        id, 
        provider,
        model, 
        image_url AS "imageUrl",
        quality_score AS "qualityScore", 
        is_archived AS "isArchived",
        organization_id AS "organizationId", 
        face_profile_id AS "faceProfileId",
        created_at AS "createdAt", 
        updated_at AS "updatedAt"
    `;

    return row;
  }

  private readonly SIMILARITY_THRESHOLD = 0.80;

  async recognizeFace(image: Express.Multer.File, organizationId: string, user: User) {
    const embedding = await this.fetchEmbedding(image);

    const similarity = await this.findBestSimilarity(
      embedding,
      user.id,
      organizationId,
    );

    const matched = similarity !== null && similarity >= this.SIMILARITY_THRESHOLD;

    return {
      matched,
      similarity: similarity ?? 0,
      threshold: this.SIMILARITY_THRESHOLD,
    };
  }

  private async fetchEmbedding(image: Express.Multer.File): Promise<number[]> {
    const baseUrl = this.config.get<string>('FACE_RECOGNITION_API_URL');
    const timeoutMs = Number(this.config.get<string>('FACE_RECOGNITION_API_TIMEOUT_MS') ?? 8000);

    if (!baseUrl) {
      throw new ServiceUnavailableException('FACE_RECOGNITION_API_URL is not configured');
    }

    const form = new FormData();
    form.append(
      'image',
      new Blob([new Uint8Array(image.buffer)], { type: image.mimetype }),
      image.originalname,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/face/embed`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new RequestTimeoutException(`Face API timed out after ${timeoutMs}ms`);
      }
      throw new ServiceUnavailableException(`Face API unreachable: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new InternalServerErrorException(`Face API ${res.status}: ${detail || res.statusText}`);
    }

    const data = (await res.json()) as PythonEmbedResponse;

    if (!Array.isArray(data?.embedding)) {
      throw new InternalServerErrorException('Face API returned malformed embedding');
    }

    return data.embedding;
  }

  private async findBestSimilarity(
    embedding: number[],
    userId: string,
    organizationId: string,
  ): Promise<number | null> {
    const vectorLiteral = `[${embedding.join(',')}]`;

    const rows = await this.prisma.$queryRaw<SimilarityRow[]>`
      SELECT 1 - (fe.embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "face_embeddings" fe
      JOIN "face_profiles" fp ON fp.id = fe.face_profile_id
      WHERE fp.user_id = ${userId}
        AND fe.organization_id = ${organizationId}
        AND fe.is_archived = false
        AND fp.is_archived = false
      ORDER BY fe.embedding <=> ${vectorLiteral}::vector
      LIMIT 1
    `;

    if (rows.length === 0) return null;

    return Number(rows[0].similarity);
  }
}
