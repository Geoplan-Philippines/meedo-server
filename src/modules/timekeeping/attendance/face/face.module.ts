import { Module } from '@nestjs/common';
import { FaceService } from './face.service';
import { FaceController } from './face.controller';
import { PrismaService } from 'src/core/database/prisma.service';

@Module({
  controllers: [FaceController],
  providers: [FaceService, PrismaService],
})
export class FaceModule {}
