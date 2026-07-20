import { BadRequestException, Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream'
import 'multer';

// Allowlist of file types accepted as ticket attachments. Anything not listed
// here is rejected. image/svg+xml is deliberately excluded (and explicitly
// rejected below) because SVGs can embed scripts and lead to stored XSS.
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  // images
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif',
  // documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  // text
  'txt', 'csv',
  // archives
  'zip',
]);

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  // images
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
  // documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // text
  'text/plain', 'text/csv',
  // archives
  'application/zip', 'application/x-zip-compressed',
  // Generic binary fallback: browsers/OSes often send this for zip/office files.
  // The extension allowlist above is the strict gate that backstops it.
  'application/octet-stream',
]);

@Injectable()
export class CloudinaryService {
  async uploadImage(file: Express.Multer.File, folder: string = 'meedo-v3/face'): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {

      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException('Invalid file type');
      }

      const upload = cloudinary.uploader.upload_stream(
        {
          folder,
          transformation: [{ fetch_format: 'auto', quality: 'auto' }],
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Cloudinary upload failed: No result returned'));

          result.secure_url = cloudinary.url(result.public_id, {
            fetch_format: 'auto',
            quality: 'auto',
            secure: true,
          });

          resolve(result);
        }
      );

      Readable.from(file.buffer).pipe(upload);
    });
  }

  /**
   * Uploads an arbitrary attachment (image or any other file type).
   *
   * `resource_type: 'auto'` lets Cloudinary store images as images (so they get
   * `f_auto,q_auto` optimisation) and everything else as `raw` — the returned
   * `secure_url` is then a direct download link. Only an allowlist of safe types
   * (images, PDF, Office docs, text, zip) is accepted; SVGs are rejected because
   * they can embed scripts. Size is capped by the controller's ParseFilePipe.
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'meedo-v3/ticket-attachments',
  ): Promise<UploadApiResponse> {
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';

    // SVGs can carry embedded <script>; block them explicitly regardless of
    // how the extension or MIME type is presented.
    if (file.mimetype === 'image/svg+xml' || extension === 'svg' || extension === 'svgz') {
      throw new BadRequestException('SVG files are not allowed');
    }

    if (
      !ALLOWED_ATTACHMENT_EXTENSIONS.has(extension) ||
      !ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)
    ) {
      throw new BadRequestException('This file type is not allowed');
    }

    const isImage = file.mimetype.startsWith('image/');

    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          // Keep the human filename in the public id so raw download URLs are readable,
          // while unique_filename avoids collisions.
          use_filename: true,
          unique_filename: true,
          filename_override: file.originalname,
          ...(isImage
            ? { transformation: [{ fetch_format: 'auto', quality: 'auto' }] }
            : {}),
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Cloudinary upload failed: No result returned'));
          resolve(result);
        },
      );

      Readable.from(file.buffer).pipe(upload);
    });
  }

  async deleteImage(publicId: string): Promise<{result: string}> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) return reject(error);
        if (result?.result !== 'ok') return reject(new Error(`Cloudinary deletion failed: ${result?.result}`));
        resolve({ result: 'ok' });
      });
    });
  }

  /**
   * Extracts the public ID from a Cloudinary URL.
   * Example: https://res.cloudinary.com/demo/image/upload/v12345678/sample.jpg -> sample
   */
  extractPublicId(url: string): string | null {
      const regex = /\/v\d+\/([^.]+)\./;
      const match = url.match(regex);
      return match ? match[1] : null;
  }
}
