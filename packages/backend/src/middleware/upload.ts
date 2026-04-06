import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { getEnv } from '../config/env.js';
import { BadRequestError } from '../utils/errors.js';

const ALLOWED_MIME_TYPES = ['application/pdf'];

/**
 * Sanitize filename: remove special chars, add random prefix.
 */
function sanitizeFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 100);
  const uniqueId = crypto.randomBytes(8).toString('hex');
  return `${uniqueId}_${baseName}${ext}`;
}

export function createUploadMiddleware() {
  const env = getEnv();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, env.UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      cb(null, sanitizeFilename(file.originalname));
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
      files: 10, // max 10 files per upload
    },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(new BadRequestError(`Invalid file type: ${file.mimetype}. Only PDF files are allowed.`));
        return;
      }
      cb(null, true);
    },
  });
}

export const uploadPDF = createUploadMiddleware();
