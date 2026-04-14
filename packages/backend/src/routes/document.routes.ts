import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../config/database.js';
import { uploadPDF } from '../middleware/upload.js';
import { uploadToCloudinary } from '../services/storage.service.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { UserRole } from '@prisma/client';
import { getBoss } from '../queue/boss.js';
import { JOB_QUEUES } from '../queue/jobs.js';
import { getLogger } from '../utils/logger.js';

const router: Router = Router();
const logger = getLogger();

/**
 * @openapi
 * /documents:
 *   get:
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const category = req.query.category as string | undefined;
    const skip = (page - 1) * limit;

    // Exclude manually inserted text entries (mimeType: 'text/html') — those belong to Textual Knowledge
    const where: any = {
      mimeType: { not: 'text/html' },
      ...(category ? { categories: { has: category } } : {}),
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          originalFilename: true,
          storedFilename: true,
          status: true,
          categories: true,
          fileSizeBytes: true,
          pageCount: true,
          progress: true,
          metadata: true,
          uploader: { select: { fullName: true } },
          createdAt: true,
        },
      }),
      prisma.document.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: documents,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /documents/{id}:
 *   get:
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const docId = req.params.id as string;
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      include: { uploader: { select: { fullName: true } } },
    });

    if (!doc) throw new NotFoundError('Document not found');

    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /documents/upload:
 *   post:
 */
router.post(
  '/upload',
  authenticate,
  requireRole(UserRole.ADMIN as any),
  uploadPDF.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info({ body: req.body, file: req.file }, 'Document upload request received');
      
      if (!req.file) {
        throw new BadRequestError('No PDF file uploaded');
      }

      const { title, category } = req.body;
      const prisma = getPrisma();
      
      // 1. Initial record
      const newDoc = await prisma.document.create({
        data: {
          title: title || req.file.originalname.replace('.pdf', ''),
          originalFilename: req.file.originalname,
          storedFilename: req.file.filename,
          filePath: req.file.path,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
          categories: [category || 'GENERAL'],
          status: 'UPLOADED',
          uploadedBy: req.user!.userId,
        },
      });

      // 2. Upload to Cloudinary for persistent storage (Force 'image' for PDFs)
      let cloudinaryUrl: string | null = null;
      try {
        cloudinaryUrl = await uploadToCloudinary(req.file.path, 'kiadp/documents', 'image');
        if (cloudinaryUrl) {
          await prisma.document.update({
            where: { id: newDoc.id },
            data: { storedFilename: cloudinaryUrl }
          });
          logger.info(`Cloudinary backup successful for doc ${newDoc.id}`);
        }
      } catch (cloudErr) {
        logger.error({ err: cloudErr }, `Cloudinary backup failed for doc ${newDoc.id}`);
      }

      // 3. Queue ingestion job
      const boss = await getBoss();
      try {
        const jobId = await boss.send(JOB_QUEUES.INGEST_DOCUMENT, {
          documentId: newDoc.id,
          filePath: req.file.path,
        });
        logger.info(`Document ingestion job queued: ${jobId} for doc ${newDoc.id}`);
      } catch (sendErr) {
        logger.error({ err: sendErr }, `Failed to queue ingestion job for doc ${newDoc.id}`);
        await prisma.document.update({
          where: { id: newDoc.id },
          data: { status: 'FAILED' }
        });
        throw sendErr;
      }

      res.status(201).json({ success: true, data: { ...newDoc, storedFilename: cloudinaryUrl || newDoc.storedFilename } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /documents/{id}:
 *   patch:
 */
router.patch('/:id', authenticate, requireRole(UserRole.ADMIN as any), uploadPDF.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docId = req.params.id as string;
    const { title, category } = req.body;
    const prisma = getPrisma();
    
    // Check if new file is uploaded
    if (req.file) {
      // 1. Find existing chunks to delete from Pinecone
      const chunks = await prisma.documentChunk.findMany({
        where: { documentId: docId },
        select: { pineconeVectorId: true },
      });
      const vectorIds = chunks.map((c: { pineconeVectorId: string | null }) => c.pineconeVectorId).filter((id: string | null): id is string => id !== null);

      if (vectorIds.length > 0) {
        const boss = await getBoss();
        await boss.send(JOB_QUEUES.DELETE_DOCUMENT, {
          documentId: docId,
          pineconeVectorIds: vectorIds,
        });
      }

      // 2. Delete existing chunks from DB
      await prisma.documentChunk.deleteMany({ where: { documentId: docId } });

      // 3. Update document with new file info and set status to UPLOADED
      const updated = await prisma.document.update({
        where: { id: docId },
        data: {
          title: title || req.file.originalname.replace('.pdf', ''),
          originalFilename: req.file.originalname,
          storedFilename: req.file.filename,
          filePath: req.file.path,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
          categories: category ? [category] : undefined,
          status: 'UPLOADED', // Reset status for re-ingestion
          progress: 0,
        }
      });

      // 4. Queue new ingestion job
      const boss = await getBoss();
      await boss.send(JOB_QUEUES.INGEST_DOCUMENT, {
        documentId: updated.id,
        filePath: req.file.path,
      });

      return res.json({ success: true, data: updated });
    }

    // Otherwise just update metadata
    const updated = await prisma.document.update({
      where: { id: docId },
      data: {
        ...(title && { title }),
        ...(category && { categories: [category] }),
      }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /documents/{id}/reprocess:
 *   post:
 *     summary: Re-run ingestion for an existing document (Admin only)
 */
router.post('/:id/reprocess', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const docId = req.params.id as string;

    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundError('Document not found');

    // Delete existing chunks + images so ingestion starts clean
    const oldChunks = await prisma.documentChunk.findMany({
      where: { documentId: docId },
      select: { pineconeVectorId: true },
    });
    const vectorIds = oldChunks.map((c: { pineconeVectorId: string | null }) => c.pineconeVectorId).filter((id: string | null): id is string => id !== null);

    if (vectorIds.length > 0) {
      const boss = await getBoss();
      await boss.send(JOB_QUEUES.DELETE_DOCUMENT, {
        documentId: docId,
        pineconeVectorIds: vectorIds,
        skipDocumentDelete: true, // only clean vectors, keep the document record
      });
    }

    await prisma.documentChunk.deleteMany({ where: { documentId: docId } });
    await prisma.documentImage.deleteMany({ where: { documentId: docId } });

    await prisma.document.update({
      where: { id: docId },
      data: { status: 'UPLOADED', progress: 0 },
    });

    // Re-queue ingestion using stored Cloudinary URL as filePath fallback
    const filePath = doc.filePath || doc.storedFilename || '';
    const boss = await getBoss();
    await boss.send(JOB_QUEUES.INGEST_DOCUMENT, {
      documentId: docId,
      filePath,
    });

    res.json({ success: true, data: { message: 'Reprocessing queued', documentId: docId } });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /documents/{id}:
 *   delete:
 */
/**
 * @openapi
 * /documents/images/proxy/{imageId}:
 *   get:
 *     summary: Proxy a document image through the backend (handles Cloudinary auth)
 */
router.get('/images/proxy/:imageId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const img = await prisma.documentImage.findUnique({
      where: { id: req.params.imageId as string },
      select: { filePath: true },
    });
    if (!img || !img.filePath) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    // Try direct URL first (works when Cloudinary asset is public)
    try {
      const directResp = await fetch(img.filePath, { signal: AbortSignal.timeout(6000) });
      if (directResp.ok && directResp.body) {
        const ct = directResp.headers.get('content-type') || 'image/jpeg';
        res.set('Content-Type', ct);
        res.set('Cache-Control', 'public, max-age=3600');
        const { Readable } = await import('stream');
        (Readable as any).fromWeb(directResp.body).pipe(res);
        return;
      }
    } catch { /* fall through to signed URL */ }

    // Fallback: generate a signed Cloudinary delivery URL
    try {
      const cloudinaryMod = await import('cloudinary');
      const cld = cloudinaryMod.v2;
      const { configureCloudinary } = await import('../services/storage.service.js');
      configureCloudinary();
      // Extract publicId: everything after /upload/(v\d+/)? and before the extension
      const m = img.filePath.match(/\/upload\/(?:v\d+\/)?(.*?)(?:\.[^./]+)?$/);
      if (m) {
        const signedSrc = cld.url(m[1], { sign_url: true, type: 'upload', resource_type: 'image', secure: true });
        const signedResp = await fetch(signedSrc, { signal: AbortSignal.timeout(6000) });
        if (signedResp.ok && signedResp.body) {
          const ct = signedResp.headers.get('content-type') || 'image/jpeg';
          res.set('Content-Type', ct);
          res.set('Cache-Control', 'public, max-age=3600');
          const { Readable } = await import('stream');
          (Readable as any).fromWeb(signedResp.body).pipe(res);
          return;
        }
      }
    } catch { /* fall through */ }

    res.status(404).json({ success: false, error: 'Image unavailable' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const docId = req.params.id as string;

    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: docId },
      select: { pineconeVectorId: true },
    });
    const vectorIds = chunks.map((c: { pineconeVectorId: string | null }) => c.pineconeVectorId).filter((id: string | null): id is string => id !== null);

    if (vectorIds.length > 0) {
      const boss = await getBoss();
      await boss.send(JOB_QUEUES.DELETE_DOCUMENT, {
        documentId: docId,
        pineconeVectorIds: vectorIds,
      });
    }

    await prisma.document.delete({ where: { id: docId } });
    res.json({ success: true, data: { message: 'Document deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

export default router;
