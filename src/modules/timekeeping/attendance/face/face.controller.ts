import { Body, Controller, FileTypeValidator, ForbiddenException, Get, MaxFileSizeValidator, ParseFilePipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { FaceEmbedding, FaceProfile } from '@prisma/client';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { FaceService } from './face.service';
import { CreateFaceProfileDTO } from './dto/create-face-profile.dto';
import { CreateFaceEmbeddingDTO } from './dto/create-face-embedding.dto';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = /^image\/(jpeg|png|webp)$/;

@Controller('timekeeping/attendance/face')
export class FaceController {
  constructor(private readonly faceService: FaceService) {}

  @Post("profiles")
  async createFaceProfile(
    @Body() createFaceProfileDTO: CreateFaceProfileDTO
  ): Promise<FaceProfile> {
    return this.faceService.createFaceProfile(createFaceProfileDTO)
  }

  @Get('profiles')
  async findAllFaceProfiles(): Promise<FaceProfile[]> {
    return this.faceService.findAllFaceProfiles()
  }

  @Get('embeddings')
  async findAllFaceEmbeddings(): Promise<FaceEmbedding[]> {
    return this.faceService.findAllFaceEmbeddings()
  }

  @Get('profiles/me')
  async findMyFaceProfiles(@Session() session: UserSession) {
    const { id } = session.user;
    const { activeOrganizationId } = session.session;

    if (!activeOrganizationId) {
      throw new ForbiddenException('No active organization selected');
    }
    
    return this.faceService.findMyFaceProfiles(id, activeOrganizationId);
  }
  
  @Post('embeddings')
  async createFaceEmbedding(
    @Body() createFaceEmbeddingDTO: CreateFaceEmbeddingDTO
  ): Promise<FaceEmbedding> {
    return this.faceService.createFaceEmbedding(createFaceEmbeddingDTO)
  }

  @Post('recognize')
  @UseInterceptors(FileInterceptor('image'))
  async recognizeFace(
    @Session() session: UserSession,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_BYTES }),
          new FileTypeValidator({ fileType: ALLOWED_IMAGE_MIME }),
        ],
      }),
    )
    image: Express.Multer.File,
  ) {
    const { user } = session;
    const { activeOrganizationId } = session.session;

    if (!activeOrganizationId) {
      throw new ForbiddenException('No active organization selected');
    }

    return this.faceService.recognizeFace(image, activeOrganizationId, user);
  }
}
  