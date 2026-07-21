import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getPrisma } from '../config/database.js';
import { uploadImage } from '../middleware/upload.js';
import { uploadBufferToCloudinary } from '../services/storage.service.js';
import { BadRequestError } from '../utils/errors.js';

const router: Router = Router();

// All tenant routes require admin authentication
router.use(authenticate, requireRole('ADMIN'));

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  logoUrl: z.string().url().optional().nullable(),
});

// POST /tenants — create institution
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSchema.parse(req.body);
    const prisma = getPrisma();
    const tenant = await prisma.tenant.create({ data });
    res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});

// GET /tenants — list all institutions with user/document counts
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { users: true, documents: true, questions: true } },
      },
    });
    res.json({ success: true, data: tenants });
  } catch (err) {
    next(err);
  }
});

// GET /tenants/:id — get single institution
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { users: true, documents: true, questions: true, answers: true } },
      },
    });
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Institution not found' });
      return;
    }
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});

// PATCH /tenants/:id — update institution name or active status
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateSchema.parse(req.body);
    const prisma = getPrisma();
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});

// POST /tenants/:id/users/:userId — assign a user to this institution
router.post('/:id/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { tenantId: req.params.id },
      select: { id: true, email: true, fullName: true, role: true, tenantId: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// DELETE /tenants/:id/users/:userId — remove user from institution (set tenantId null)
router.delete('/:id/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { tenantId: null },
      select: { id: true, email: true, fullName: true, role: true, tenantId: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// POST /tenants/:id/logo — upload institution logo to Cloudinary
router.post('/:id/logo', uploadImage.single('logo'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new BadRequestError('No image file uploaded');
    const logoUrl = await uploadBufferToCloudinary(
      req.file.buffer,
      'eduai/logos',
      `tenant-${req.params.id}`
    );
    if (!logoUrl) throw new Error('Failed to upload logo to storage');
    const prisma = getPrisma();
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { logoUrl },
    });
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});

// GET /tenants/:id/analytics — usage analytics for an institution
router.get('/:id/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const tenantId = req.params.id;

    // Questions per day for the last 14 days
    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);

    const dailyRaw = await prisma.$queryRawUnsafe<{ day: string; count: bigint }[]>(`
      SELECT DATE_TRUNC('day', created_at)::date::text AS day, COUNT(*)::bigint AS count
      FROM questions
      WHERE tenant_id = '${tenantId}'
        AND created_at >= '${since.toISOString()}'
      GROUP BY day
      ORDER BY day
    `);

    // Fill in zeros for missing days
    const dailyMap = new Map(dailyRaw.map(r => [r.day, Number(r.count)]));
    const daily: { day: string; questions: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      daily.push({ day: key, questions: dailyMap.get(key) ?? 0 });
    }

    // Recent questions
    const recent = await prisma.question.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        queryText: true,
        createdAt: true,
        user: { select: { fullName: true } },
        answer: { select: { confidenceScore: true, isGrounded: true } },
      },
    });

    // Document status breakdown
    const docStatuses = await prisma.document.groupBy({
      by: ['status'],
      where: { tenantId, mimeType: { not: 'text/html' } },
      _count: { id: true },
    });

    res.json({
      success: true,
      data: {
        daily,
        recent: recent.map(q => ({
          id: q.id,
          question: q.queryText,
          askedBy: q.user.fullName,
          createdAt: q.createdAt,
          confidence: q.answer?.confidenceScore ?? null,
          isGrounded: q.answer?.isGrounded ?? null,
        })),
        docStatuses: docStatuses.map(s => ({ status: s.status, count: s._count.id })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /tenants/:id/users — list users belonging to this institution
router.get('/:id/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: { tenantId: req.params.id },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

export default router;
