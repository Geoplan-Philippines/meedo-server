import {
  Controller,
  ForbiddenException,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { CloudinaryService } from '../../../shared/cloudinary/cloudinary.service';

/** Kept in sync with the client guard in the markdown editor. */
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export interface TicketAttachmentResult {
  url: string;
  name: string;
  mimeType: string;
  bytes: number;
  /** Cloudinary resource kind — 'image' renders inline, otherwise a file chip. */
  resourceType: string;
}

@Controller('tickets/attachments')
export class TicketAttachmentsController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  /**
   * Uploads a single description attachment (pasted, dropped, or picked) and
   * returns its hosted URL. Any file type is accepted except executables/scripts
   * (blocked in CloudinaryService); images are stored optimised, the rest as raw.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Session() session: UserSession,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_ATTACHMENT_BYTES })],
      }),
    )
    file: Express.Multer.File,
  ): Promise<TicketAttachmentResult> {
    const { activeOrganizationId } = session.session;
    if (!activeOrganizationId) {
      throw new ForbiddenException('No active organization selected');
    }

    const result = await this.cloudinary.uploadFile(
      file,
      `meedo-v3/ticket-attachments/${activeOrganizationId}`,
    );

    return {
      url: result.secure_url,
      name: file.originalname,
      mimeType: file.mimetype,
      bytes: result.bytes ?? file.size,
      resourceType: result.resource_type,
    };
  }
}
