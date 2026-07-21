import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../config/database.js';
import { uploadPDF } from '../middleware/upload.js';
import { uploadToCloudinary } from '../services/storage.service.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { resolveTenantContext, requireLiveTenant } from '../middleware/rbac.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { UserRole } from '@prisma/client';
import { getBoss } from '../queue/boss.js';
import { JOB_QUEUES } from '../queue/jobs.js';
import { getLogger } from '../utils/logger.js';
import { chatComplete } from '../services/qa.service.js';

const router: Router = Router();
const logger = getLogger();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rejects a /:id document route when the document belongs to another institution.
 *
 * The list endpoint has always been tenant-scoped, but the by-id endpoints were not:
 * knowing a UUID was enough for any authenticated user — including a student at a
 * different school — to read, edit or delete a document. Run AFTER resolveTenantContext.
 *
 * Responds 404 rather than 403 on a cross-tenant hit: a 403 would confirm that a
 * document with that id exists, which is itself a cross-tenant disclosure.
 */
async function requireDocumentInScope(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id;
    if (!id || !UUID_RE.test(id)) {
      next(new NotFoundError('Document not found'));
      return;
    }

    const doc = await getPrisma().document.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!doc) {
      next(new NotFoundError('Document not found'));
      return;
    }

    if (!req.isSuperAdmin && doc.tenantId !== (req.callerTenantId ?? null)) {
      next(new NotFoundError('Document not found'));
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /documents:
 *   get:
 */
router.get('/', authenticate, resolveTenantContext, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const category = req.query.category as string | undefined;
    const skip = (page - 1) * limit;

    // Scope comes from resolveTenantContext, never from a fresh lookup of the caller's own
    // row. Reading the user directly here is what made "view as institution" invisible to
    // this handler: a super admin previewing one school still saw every school's documents.
    // Only a platform-wide caller may narrow by ?tenantId=; an institution admin is pinned.
    const queryTenantId = req.query.tenantId as string | undefined;
    const effectiveTenantId = req.callerTenantId ?? (req.isSuperAdmin ? queryTenantId ?? null : null);

    // Exclude manually inserted text entries (mimeType: 'text/html') — those belong to Textual Knowledge
    const where: any = {
      mimeType: { not: 'text/html' },
      ...(category ? { categories: { has: category } } : {}),
      ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
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
 * Prompt suggestions for the student home screen.
 *
 * These used to be the first sentence of a random chunk, which produced things like
 * "[Visual Evidence from Page 1]: Roshan Rajapakse 1 https://youtube.com/..." — a caption
 * for an image, a name and a URL, offered as something to ask. Two faults: the query never
 * excluded the visual-evidence pseudo-chunks, and more fundamentally a fragment of a
 * document is not a prompt. A suggestion has to be a QUESTION, or clicking it sends
 * nonsense to the assistant.
 *
 * So the sample is cleaned, then one cheap model call turns it into questions the material
 * can actually answer. Cached per institution: the documents change rarely, students load
 * this screen constantly, and a model call per page load would be absurd.
 */
const suggestionCache = new Map<string, { at: number; items: string[] }>();
const SUGGESTION_TTL_MS = 6 * 60 * 60 * 1000;

/** Chunk text that is furniture rather than prose, and makes a poor basis for a question. */
function isUsableForPrompt(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 60) return false;
  if (/^\[Visual Evidence/i.test(t)) return false;          // image captions
  if (/https?:\/\/|www\./i.test(t)) return false;             // link dumps
  // Mostly capitals is a title slide or a header, not a sentence.
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length > 20 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) return false;
  return true;
}

router.get('/suggestions', authenticate, resolveTenantContext, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    // Same rule as the document list above — suggestions are drawn from real material, so
    // an unscoped sample would surface one school's content on another school's home page.
    const tenantId = req.callerTenantId ?? (req.isSuperAdmin ? (req.query.tenantId as string | undefined) ?? null : null);

    const cacheKey = tenantId ?? '__platform__';
    const cached = suggestionCache.get(cacheKey);
    if (cached && Date.now() - cached.at < SUGGESTION_TTL_MS) {
      return res.json({ success: true, data: cached.items });
    }

    const where = {
      content: { not: '' },
      // Visual pseudo-chunks sit at chunkIndex >= 999 (page images) or below zero (images
      // inside text entries). Both describe a picture; neither is prose to ask about.
      chunkIndex: { gte: 0, lt: 999 },
      document: {
        mimeType: { not: 'text/html' },
        status: 'COMPLETED' as const,
        ...(tenantId ? { tenantId } : {}),
      },
    };

    const total = await prisma.documentChunk.count({ where });
    if (total === 0) {
      return res.json({ success: true, data: [] });
    }

    const SAMPLE = Math.min(10, total);
    const offsets = [...new Set(Array.from({ length: SAMPLE }, () => Math.floor(Math.random() * total)))];
    const rows = await Promise.all(
      offsets.map(skip => prisma.documentChunk.findFirst({ where, select: { content: true }, skip })),
    );

    const material = rows
      .map(r => r?.content ?? '')
      .filter(isUsableForPrompt)
      .map(t => t.replace(/\s+/g, ' ').trim().slice(0, 400))
      .join('\n---\n');

    if (!material) {
      return res.json({ success: true, data: [] });
    }

    let items: string[] = [];
    try {
      const reply = await chatComplete([
        {
          role: 'system',
          content:
            'You write example questions a student might ask about their course material. ' +
            'Given excerpts, return 4 short questions ANSWERABLE FROM THOSE EXCERPTS. ' +
            'One per line, no numbering, no quotes, no preamble. Each under 12 words. ' +
            'Ask about the subject matter, never about the document itself — not "what does page 3 say".',
        },
        { role: 'user', content: material },
      ], { temperature: 0.4 });

      items = String(reply ?? '')
        .split('\n')
        .map(l => l.replace(/^\s*(?:[-*\d.)]+\s*)?/, '').replace(/^["'“]|["'”]$/g, '').trim())
        .filter(l => l.length >= 12 && l.length <= 110 && l.includes(' '))
        .slice(0, 4);
    } catch (err) {
      getLogger().warn({ err: (err as Error)?.message }, 'suggestions: generation failed');
    }

    // No cards beats bad cards. An empty home screen reads as "nothing yet"; a card of
    // scraped header text reads as a broken product.
    suggestionCache.set(cacheKey, { at: Date.now(), items });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});


/**
 * @openapi
 * /documents/{id}:
 *   get:
 */
router.get('/:id', authenticate, resolveTenantContext, requireDocumentInScope, async (req: Request, res: Response, next: NextFunction) => {
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
  resolveTenantContext,
  requireLiveTenant,
  uploadPDF.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info({ body: req.body, file: req.file }, 'Document upload request received');
      
      if (!req.file) {
        throw new BadRequestError('No PDF file uploaded');
      }

      const { title, category, tenantId: bodyTenantId, courseId } = req.body;
      const prisma = getPrisma();

      // Ownership follows the active scope. Without this, a super admin uploading while
      // viewing an institution would file the document under nobody — visible to every
      // tenant filter and belonging to none.
      const effectiveTenantId = req.callerTenantId ?? (req.isSuperAdmin ? bodyTenantId ?? null : null);

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
          ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
          ...(courseId ? { courseId: String(courseId) } : {}),
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
router.patch('/:id', authenticate, requireRole(UserRole.ADMIN as any), resolveTenantContext, requireDocumentInScope, uploadPDF.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docId = req.params.id as string;
    const { title, category } = req.body;
    const prisma = getPrisma();
    
    // Check if new file is uploaded
    if (req.file) {
      // Replacing the file: drop the old chunks so re-ingestion starts clean. There is no
      // longer a vector store to clean up alongside them — embeddings live in pgvector, in
      // these same rows, and go with them.
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
router.post('/:id/reprocess', authenticate, requireRole(UserRole.ADMIN as any), resolveTenantContext, requireDocumentInScope, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const docId = req.params.id as string;

    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundError('Document not found');

    // Delete existing chunks + images so ingestion starts clean. The file itself stays —
    // reprocessing re-reads it — and the embeddings live in these rows, so removing them is
    // the whole cleanup.
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
router.get('/images/proxy/:imageId', async (req: Request, res: Response, next: NextFunction) => {
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

router.delete('/:id', authenticate, requireRole(UserRole.ADMIN as any), resolveTenantContext, requireDocumentInScope, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const docId = req.params.id as string;

    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    // Every child table cascades from Document, so chunks, pages, images and answer
    // sources go with the row. The uploaded file does not — no foreign key reaches a
    // filesystem — so it is queued for removal separately. Queued before the delete, since
    // filePath is about to become unreadable.
    const boss = await getBoss();
    await boss.send(JOB_QUEUES.DELETE_DOCUMENT, {
      documentId: docId,
      filePath: doc.filePath,
    });

    await prisma.document.delete({ where: { id: docId } });
    res.json({ success: true, data: { message: 'Document deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

// GET /documents/suggestions — returns random chunk excerpts for home-page prompt cards

export default router;
