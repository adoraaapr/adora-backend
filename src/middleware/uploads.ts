import type {Request} from 'express';
import { randomUUID } from 'node:crypto';
import { cloudinary } from '../config/providers.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadImage(file: Express.Multer.File, folder: string) {
  if (!allowed.has(file.mimetype)) {
    throw new AppError(400, 'INVALID_FILE_TYPE', 'Only JPEG, PNG, and WebP images are allowed');
  }
  if (file.size > env.UPLOAD_MAX_BYTES) {
    throw new AppError(413, 'FILE_TOO_LARGE', 'Image exceeds configured size limit');
  }

  // Development mock fallback when placeholder Cloudinary credentials are used
  const isMock =
    env.CLOUDINARY_CLOUD_NAME.includes('placeholder') ||
    env.CLOUDINARY_CLOUD_NAME.includes('replace');

  if (isMock) {
    return {
      url: `https://placehold.co/800x600/064e3b/ffffff.png?text=${encodeURIComponent(folder)}+Photo`,
      publicId: `dev_${folder}_${randomUUID()}`
    };
  }

  try {
    const result = await new Promise<{secure_url: string; public_id: string}>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `adora/${folder}`,
          resource_type: 'image',
          public_id: randomUUID(),
          overwrite: false,
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
        },
        (err, res) => (err ? reject(err) : res ? resolve(res) : reject(new Error('Cloudinary upload failed')))
      );
      stream.end(file.buffer);
    });
    return {url: result.secure_url, publicId: result.public_id};
  } catch (err) {
    if (env.NODE_ENV === 'development') {
      return {
        url: `https://placehold.co/800x600/064e3b/ffffff.png?text=${encodeURIComponent(folder)}+Photo`,
        publicId: `dev_fallback_${folder}_${randomUUID()}`
      };
    }
    throw err;
  }
}

export function requireFile(req: Request, key = 'file') {
  const file = (req as Request & {file?: Express.Multer.File}).file;
  if (!file) throw new AppError(400, 'FILE_REQUIRED', `Required image field: ${key}`);
  return file;
}
