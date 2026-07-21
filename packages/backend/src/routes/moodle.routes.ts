import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPrisma } from '../config/database.js';
import { getLogger } from '../utils/logger.js';
import { getBoss } from '../queue/boss.js';
import { JOB_QUEUES } from '../queue/jobs.js';
import { uploadPDF } from '../middleware/upload.js';
import { uploadToCloudinary } from '../services/storage.service.js';
import { askQuestion } from '../services/qa.service.js';
import { authenticateApiKey } from '../middleware/api-key.middleware.js';
import { generateApiKey } from '../middleware/api-key.middleware.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { UserRole } from '@prisma/client';

const router: Router = Router();
const logger = getLogger();

// ─── API Key Management (JWT admin auth) ────────────────────────────────────

/**
 * POST /moodle/api-keys
 * Admin creates an API key for a tenant (institution).
 * Returns the raw key ONCE — store it immediately.
 */
router.post('/api-keys', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, tenantId, expiresAt } = req.body;
    if (!name || !tenantId) {
      res.status(400).json({ error: 'name and tenantId are required' });
      return;
    }
    const prisma = getPrisma();
    const { rawKey, hash, prefix } = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        keyHash: hash,
        keyPrefix: prefix,
        tenantId,
        createdBy: req.user!.userId,
        ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      },
    });
    res.status(201).json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,   // shown ONCE
        prefix,
        tenantId,
        createdAt: apiKey.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /moodle/api-keys?tenantId=...
 * List API keys for a tenant (key hash never returned).
 */
router.get('/api-keys', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { tenantId } = req.query;
    const keys = await prisma.apiKey.findMany({
      where: tenantId ? { tenantId: String(tenantId) } : {},
      select: { id: true, name: true, keyPrefix: true, tenantId: true, isActive: true, lastUsedAt: true, requestCount: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: keys });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /moodle/api-keys/:id
 * Revoke an API key.
 */
router.delete('/api-keys/:id', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    await prisma.apiKey.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Moodle Plugin Endpoints (API key auth) ──────────────────────────────────

/**
 * POST /moodle/ingest
 * Moodle plugin calls this when a teacher uploads a course resource.
 * Accepts multipart/form-data with the file + metadata.
 *
 * Headers:  Authorization: Bearer sk-kh-<key>
 * Body:     file (PDF/image), title, courseId, courseName, resourceId
 */
router.post(
  '/ingest',
  authenticateApiKey,
  uploadPDF.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const tenantId = req.apiKey!.tenantId;
      if (!tenantId) {
        res.status(403).json({ error: 'This API key is not scoped to an institution' });
        return;
      }

      const { title, courseId, courseName, resourceId } = req.body;
      if (!courseId) {
        res.status(400).json({ error: 'courseId is required' });
        return;
      }

      const prisma = getPrisma();

      // Find or create system uploader for this tenant
      const systemEmail = `moodle-system+${tenantId}@system.local`;
      let systemUser = await prisma.user.findUnique({ where: { email: systemEmail } });
      if (!systemUser) {
        systemUser = await prisma.user.create({
          data: {
            email: systemEmail,
            passwordHash: 'moodle-system-no-login',
            fullName: 'Moodle Sync',
            role: 'STUDENT',
            isActive: true,
            tenantId,
          },
        });
      }

      // If this resourceId was already ingested, delete the old doc first
      if (resourceId) {
        const existing = await prisma.document.findFirst({
          where: { tenantId, courseId: String(courseId), metadata: { path: ['moodleResourceId'], equals: String(resourceId) } },
        });
        if (existing) {
          await prisma.document.delete({ where: { id: existing.id } });
          logger.info({ resourceId }, 'Moodle: replaced existing document for resource');
        }
      }

      const docTitle = title || req.file.originalname.replace(/\.[^.]+$/, '');
      const newDoc = await prisma.document.create({
        data: {
          title: docTitle,
          originalFilename: req.file.originalname,
          storedFilename: req.file.filename,
          filePath: req.file.path,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
          categories: [courseName || 'Moodle'],
          courseId: String(courseId),
          status: 'UPLOADED',
          uploadedBy: systemUser.id,
          tenantId,
          metadata: { moodleResourceId: resourceId ? String(resourceId) : null, courseName: courseName || null },
        },
      });

      // Upload to Cloudinary
      try {
        const cloudinaryUrl = await uploadToCloudinary(req.file.path, 'kiadp/moodle', 'image');
        if (cloudinaryUrl) {
          await prisma.document.update({ where: { id: newDoc.id }, data: { storedFilename: cloudinaryUrl } });
        }
      } catch (cloudErr) {
        logger.warn({ err: cloudErr }, 'Moodle ingest: Cloudinary backup failed, continuing');
      }

      // Queue ingestion
      const boss = await getBoss();
      await boss.send(JOB_QUEUES.INGEST_DOCUMENT, { documentId: newDoc.id });

      res.status(202).json({
        success: true,
        data: { documentId: newDoc.id, status: 'queued', title: docTitle },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /moodle/ingest/:courseId/:resourceId
 * Moodle plugin calls this when a teacher deletes a course resource.
 */
router.delete('/ingest/:courseId/:resourceId', authenticateApiKey, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.apiKey!.tenantId;
    if (!tenantId) { res.status(403).json({ error: 'Not scoped to an institution' }); return; }
    const prisma = getPrisma();
    const doc = await prisma.document.findFirst({
      where: {
        tenantId,
        courseId: req.params.courseId,
        metadata: { path: ['moodleResourceId'], equals: req.params.resourceId },
      },
    });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    await prisma.document.delete({ where: { id: doc.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /moodle/ask
 * Moodle plugin calls this when a student submits a question.
 * Scoped to the institution (tenantId from API key) and specific course (courseId in body).
 */
router.post('/ask', authenticateApiKey, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z.object({
      question: z.string().min(1),
      courseId: z.string().min(1),
      language: z.string().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { question, courseId, language } = parsed.data;
    const tenantId = req.apiKey!.tenantId ?? undefined;

    const prisma = getPrisma();
    const systemEmail = `moodle-system+${tenantId}@system.local`;
    const systemUser = await prisma.user.findUnique({ where: { email: systemEmail } });
    if (!systemUser) {
      res.status(400).json({ error: 'No documents have been synced for this institution yet' });
      return;
    }

    const result = await askQuestion(
      systemUser.id,
      question,
      [],
      language ?? 'en',
      'grounded',
      tenantId,
      courseId,
    );

    res.json({
      answer: result.answerText,
      isGrounded: result.isGrounded,
      sources: result.sources.map(s => ({
        document: s.sourceDocument.title,
        page: s.pageNumber,
        excerpt: s.excerpt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
