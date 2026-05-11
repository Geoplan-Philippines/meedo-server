import { Body, Controller, FileTypeValidator, Get, MaxFileSizeValidator, ParseFilePipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FaceService } from './face.service';
import { CreateFaceProfileDTO } from './dto/create-face-profile.dto';
import { CreateFaceEmbeddingDTO } from './dto/create-face-embedding.dto';
import { FaceEmbedding, FaceProfile } from '@prisma/client';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { auth } from 'src/core/auth/auth';

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
  async findMyFaceProfiles(@Session() s: UserSession<typeof auth>) {
    return this.faceService.findMyFaceProfiles(s.user.id, s.session.activeOrganizationId!);
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
    @Session() s: UserSession<typeof auth>,
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
    console.log(s)
    return this.faceService.recognizeFace(image, s.session.activeOrganizationId!, s.user);
  }
}
  