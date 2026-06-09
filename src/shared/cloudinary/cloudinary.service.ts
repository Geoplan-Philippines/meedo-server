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

          const url = result.secure_url;
          const uploadToken = '/upload/';
          const uploadIndex = url.indexOf(uploadToken);

          if (uploadIndex !== -1) {
            const before = url.substring(0, uploadIndex + uploadToken.length);
            const after = url.substring(uploadIndex + uploadToken.length);
            result.secure_url = `${before}f_auto,q_auto/${after}`;
          }

          resolve(result);
        }
      );

      Readable.from(file.buffer).pipe(upload);
    });
  }

  async deleteImage(publicId: string): Promise<{result: string}> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) return reject(error);
        resolve({result: 'Image deleted successfully'});
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
