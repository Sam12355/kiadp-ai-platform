import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { UserRole } from '@prisma/client';
import { resolveTenantContext, requireTenantParam, requireSuperAdmin } from '../middleware/rbac.js';
import { getPrisma } from '../config/database.js';
import { uploadImage } from '../middleware/upload.js';
import { uploadBufferToCloudinary } from '../services/storage.service.js';
import { BadRequestError, ForbiddenError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';

const router: Router = Router();

/**
 * GET /tenants/public — institutions a student may ask to join. Unauthenticated.
 *
 * Returns the minimum a picker needs and nothing else: no counts, no contact details, no
 * plan or trial state. It does disclose which institutions use the platform, which is a
 * deliberate trade for letting students self-serve — the alternative is a per-school join
 * code, which is private but has to be distributed.
 *
 * Inactive institutions are omitted, so deactivating a school also closes its intake.
 */
router.get('/public', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tenants = await getPrisma().tenant.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, logoUrl: true },
    });
    res.json({ success: true, data: tenants });
  } catch (err) {
    next(err);
  }
});

// All tenant routes BELOW require admin authentication.
//
// Requiring the ADMIN role alone is NOT sufficient here: an institution admin is also an
// ADMIN, so without the tenant guards below every school admin could read, rename and
// deactivate every other school on the platform. resolveTenantContext establishes who
// the caller is; each route then declares its own scope.
router.use(authenticate, requireRole(UserRole.ADMIN as any), resolveTenantContext);

// Applies to every /:id route below — rejects non-UUIDs and cross-tenant access.
// Mounted before the handlers so no handler ever sees an id it may not touch.
router.use('/:id', requireTenantParam('id'));

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  logoUrl: z.string().url().optional().nullable(),
});

/**
 * Billing state. Split from updateSchema because these two fields decide whether an
 * institution can use the product at all, and an institution admin edits their own name
 * and logo — they must not be able to extend their own trial.
 */
const planSchema = z.object({
  plan: z.enum(['trial', 'paid']).optional(),
  // Null clears the trial end date, which for a 'trial' plan means it never lapses.
  trialEndsAt: z.string().datetime().nullable().optional(),
});

// POST /tenants — create institution. Onboarding a school is a platform-owner action.
router.post('/', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSchema.parse(req.body);
    const prisma = getPrisma();
    const tenant = await prisma.tenant.create({ data });
    res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});

// GET /tenants — list institutions with user/document counts.
// Scoped rather than blocked: a super admin sees every school, an institution admin
// sees only their own, so the response never reveals that other schools exist.
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const tenants = await prisma.tenant.findMany({
      where: req.isSuperAdmin ? {} : { id: req.callerTenantId ?? undefined },
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

/**
 * PATCH /tenants/:id/plan — set an institution's billing state and trial expiry.
 *
 * Platform owner only. requireTenantParam would happily let an institution admin through
 * to their own tenant, and self-service on the field that decides whether your trial has
 * ended is not a feature.
 *
 * Accepts an explicit timestamp rather than a number of days, so an exact expiry can be
 * set — including one in the past, which is how you watch the lockout actually fire
 * instead of waiting a week to find out whether it works.
 */
router.patch('/:id/plan', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = planSchema.parse(req.body);
    const tenant = await getPrisma().tenant.update({
      where: { id: req.params.id },
      data: {
        ...(data.plan ? { plan: data.plan } : {}),
        ...(data.trialEndsAt !== undefined
          ? { trialEndsAt: data.trialEndsAt === null ? null : new Date(data.trialEndsAt) }
          : {}),
      },
      select: { id: true, name: true, plan: true, trialEndsAt: true },
    });
    getLogger().info({ tenantId: tenant.id, plan: tenant.plan, trialEndsAt: tenant.trialEndsAt }, 'tenant plan updated');
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});

// POST /tenants/:id/users/:userId — assign a user to this institution.
//
// requireTenantParam already pins :id to the caller's own tenant. The remaining risk is
// the TARGET: without this check an institution admin could claim any account on the
// platform — including a super admin, whose tenantId is null — and thereby capture it
// into their own school. A super admin may move anyone; an institution admin may only
// take on unaffiliated non-admin accounts, or touch users already theirs.
router.post('/:id/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const target = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, role: true, tenantId: true },
    });

    if (!target) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (!req.isSuperAdmin) {
      const alreadyMine = target.tenantId === req.callerTenantId;
      const claimable = target.tenantId === null && target.role !== 'ADMIN';
      if (!alreadyMine && !claimable) {
        throw new ForbiddenError('That user belongs to another institution');
      }
    }

    const user = await prisma.user.update({
      where: { id: target.id },
      data: { tenantId: req.params.id },
      select: { id: true, email: true, fullName: true, role: true, tenantId: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// DELETE /tenants/:id/users/:userId — remove user from institution (set tenantId null).
// Only detaches users who are actually in the named institution, so a stale or guessed
// userId cannot be used to strip another school's user of their tenant.
router.delete('/:id/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { count } = await prisma.user.updateMany({
      where: { id: req.params.userId, tenantId: req.params.id },
      data: { tenantId: null },
    });

    if (count === 0) {
      res.status(404).json({ success: false, error: 'User is not a member of this institution' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
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

    // Parameterised, not $queryRawUnsafe with string interpolation. tenantId reaches this
    // handler from the URL; requireTenantParam already constrains it to a UUID belonging
    // to the caller, but the query must not depend on an upstream guard for its safety.
    const dailyRaw = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT DATE_TRUNC('day', created_at)::date::text AS day, COUNT(*)::bigint AS count
      FROM questions
      WHERE tenant_id = ${tenantId}::uuid
        AND created_at >= ${since}
      GROUP BY day
      ORDER BY day
    `;

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

    // ── Figures an institution actually acts on ──────────────────────────────
    // Volume alone says the tool is used; it does not say it is working. The grounded rate
    // is the one that tells a school whether its own material is answering its students'
    // questions, and the ungrounded questions below are the reading list for what to
    // upload next.
    const [totalAnswers, groundedAnswers, activeAskers, topDocsRaw, ungroundedRecent] = await Promise.all([
      prisma.answer.count({ where: { tenantId } }),
      prisma.answer.count({ where: { tenantId, isGrounded: true } }),
      prisma.question.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      // Which documents are actually carrying the answers. answer_sources rows are written
      // once per cited chunk, so counting them ranks by how often a document is leaned on.
      prisma.$queryRaw<{ id: string; title: string; citations: bigint }[]>`
        SELECT d.id, d.title, COUNT(*)::bigint AS citations
        FROM answer_sources s
        JOIN documents d ON d.id = s.document_id
        WHERE d.tenant_id = ${tenantId}::uuid
        GROUP BY d.id, d.title
        ORDER BY citations DESC
        LIMIT 8
      `,
      // Questions the documents could not answer — the gaps worth filling.
      prisma.question.findMany({
        where: { tenantId, answer: { isGrounded: false } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, queryText: true, createdAt: true },
      }),
    ]);

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
        summary: {
          totalAnswers,
          groundedAnswers,
          // Null rather than 0 when nothing has been asked yet: "0% grounded" reads as a
          // broken knowledge base, when it means nobody has asked anything.
          groundedRate: totalAnswers > 0 ? groundedAnswers / totalAnswers : null,
          activeAskers: activeAskers.length,
          questionsLast14: daily.reduce((sum, d) => sum + d.questions, 0),
        },
        topDocuments: topDocsRaw.map(d => ({ id: d.id, title: d.title, citations: Number(d.citations) })),
        ungrounded: ungroundedRecent.map(q => ({ id: q.id, question: q.queryText, createdAt: q.createdAt })),
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
      // isPendingApproval belongs here: the panel already renders a "Pending" pill from it,
      // which could never appear while the field was left out of this select.
      select: { id: true, email: true, fullName: true, role: true, isActive: true, isPendingApproval: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

export default router;
