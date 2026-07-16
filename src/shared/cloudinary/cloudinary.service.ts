import { BadRequestException, Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream'
import 'multer';

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
   * `secure_url` is then a direct download link. Executable / script types are
   * rejected outright; size is capped by the controller's ParseFilePipe.
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'meedo-v3/ticket-attachments',
  ): Promise<UploadApiResponse> {
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const blockedExtensions = [
      'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'cpl', 'jar',
      'app', 'sh', 'ps1', 'vbs', 'dll', 'msc', 'reg',
    ];
    if (blockedExtensions.includes(extension)) {
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
