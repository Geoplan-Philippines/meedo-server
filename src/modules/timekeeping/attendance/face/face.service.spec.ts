import { InternalServerErrorException, RequestTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { FaceService } from './face.service';
import { PrismaService } from '../../../../core/database/prisma.service';

const mockFaceProfile = {
  id: 'face-profile-uuid-1',
  status: 'ACTIVE' as const,
  enrolledAt: new Date(),
  disabledAt: null,
  isArchived: false,
  organizationId: 'org-geo',
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFaceEmbedding = {
  id: 'face-embedding-uuid-1',
  provider: 'DEEPFACE' as const,
  model: 'ARCFACE' as const,
  imageUrl: null,
  qualityScore: null,
  isArchived: false,
  organizationId: 'org-geo',
  faceProfileId: 'face-profile-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  faceProfile: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  faceEmbedding: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

global.fetch = jest.fn();

describe('FaceService', () => {
  let service: FaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaceService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<FaceService>(FaceService);
    jest.resetAllMocks();
  });

  describe('createFaceProfile', () => {
    it('creates and returns a face profile', async () => {
      mockPrismaService.faceProfile.create.mockResolvedValue(mockFaceProfile);

      const result = await service.createFaceProfile({
        userId: 'user-uuid-1',
        organizationId: 'org-geo',
        status: 'ACTIVE',
      });

      expect(mockPrismaService.faceProfile.create).toHaveBeenCalled();
      expect(result).toEqual(mockFaceProfile);
    });
  });

  describe('findMyFaceProfiles', () => {
    it('returns face profiles for the user and organization', async () => {
      mockPrismaService.faceProfile.findMany.mockResolvedValue([mockFaceProfile]);

      const result = await service.findMyFaceProfiles('user-uuid-1', 'org-geo');

      expect(mockPrismaService.faceProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-1', organizationId: 'org-geo' },
        }),
      );
      expect(result).toEqual([mockFaceProfile]);
    });
  });

  describe('createFaceEmbedding', () => {
    it('creates and returns a face embedding', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([mockFaceEmbedding]);

      const result = await service.createFaceEmbedding({
        embedding: [0.1, 0.2, 0.3],
        model: 'ARCFACE',
        organizationId: 'org-geo',
        faceProfileId: 'face-profile-uuid-1',
      });

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
      expect(result).toEqual(mockFaceEmbedding);
    });
  });

  describe('recognizeFace', () => {
    const mockFile = {
      buffer: Buffer.from('fake-image'),
      mimetype: 'image/jpeg',
      originalname: 'test.jpg',
    } as Express.Multer.File;

    const mockUser = { id: 'user-uuid-1' } as any;

    it('returns matched true when similarity exceeds threshold', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'FACE_RECOGNITION_API_URL') return 'http://localhost:5000';
        if (key === 'FACE_RECOGNITION_API_TIMEOUT_MS') return '8000';
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
      });

      mockPrismaService.$queryRaw.mockResolvedValue([{ similarity: 0.95 }]);

      const result = await service.recognizeFace(mockFile, 'org-geo', mockUser);

      expect(result.matched).toBe(true);
      expect(result.similarity).toBe(0.95);
      expect(result.threshold).toBe(0.80);
    });

    it('returns matched false when similarity is below threshold', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'FACE_RECOGNITION_API_URL') return 'http://localhost:5000';
        if (key === 'FACE_RECOGNITION_API_TIMEOUT_MS') return '8000';
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
      });

      mockPrismaService.$queryRaw.mockResolvedValue([{ similarity: 0.50 }]);

      const result = await service.recognizeFace(mockFile, 'org-geo', mockUser);

      expect(result.matched).toBe(false);
    });

    it('returns matched false when no embeddings found', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'FACE_RECOGNITION_API_URL') return 'http://localhost:5000';
        if (key === 'FACE_RECOGNITION_API_TIMEOUT_MS') return '8000';
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
      });

      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.recognizeFace(mockFile, 'org-geo', mockUser);

      expect(result.matched).toBe(false);
      expect(result.similarity).toBe(0);
    });

    it('throws ServiceUnavailableException when API URL is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(service.recognizeFace(mockFile, 'org-geo', mockUser)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws RequestTimeoutException when fetch times out', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'FACE_RECOGNITION_API_URL') return 'http://localhost:5000';
        if (key === 'FACE_RECOGNITION_API_TIMEOUT_MS') return '8000';
      });

      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      (global.fetch as jest.Mock).mockRejectedValue(abortError);

      await expect(service.recognizeFace(mockFile, 'org-geo', mockUser)).rejects.toThrow(
        RequestTimeoutException,
      );
    });

    it('throws ServiceUnavailableException when fetch fails with network error', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'FACE_RECOGNITION_API_URL') return 'http://localhost:5000';
        if (key === 'FACE_RECOGNITION_API_TIMEOUT_MS') return '8000';
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(service.recognizeFace(mockFile, 'org-geo', mockUser)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws InternalServerErrorException when API returns non-ok response', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'FACE_RECOGNITION_API_URL') return 'http://localhost:5000';
        if (key === 'FACE_RECOGNITION_API_TIMEOUT_MS') return '8000';
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue(''),
      });

      await expect(service.recognizeFace(mockFile, 'org-geo', mockUser)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('throws InternalServerErrorException when API returns malformed embedding', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'FACE_RECOGNITION_API_URL') return 'http://localhost:5000';
        if (key === 'FACE_RECOGNITION_API_TIMEOUT_MS') return '8000';
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ embedding: 'not-an-array' }),
      });

      await expect(service.recognizeFace(mockFile, 'org-geo', mockUser)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});