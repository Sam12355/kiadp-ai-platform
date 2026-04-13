import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { UserRole } from '@prisma/client';
import { processTextContent } from '../services/ingestion.service.js';
import { BadRequestError } from '../utils/errors.js';

const router: Router = Router();

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     summary: Get dashboard statistics (Admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 */
router.get('/stats', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    
    const [totalDocs, totalChunks, totalQuestions, activeUsers, recentDocuments] = await Promise.all([
      prisma.document.count(),
      prisma.documentChunk.count(),
      prisma.question.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.document.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalDocuments: totalDocs,
        totalChunks: totalChunks,
        totalQuestions: totalQuestions,
        activeUsers: activeUsers,
        recentActivity: recentDocuments,
        systemStatus: {
          database: 'online',
          pinecone: 'online', // In a real app, check Pinecone health too
          openai: 'online'    // In a real app, check OpenAI connectivity
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /admin/users:
 *   get:
 *     summary: List all users (Admin only)
 *     tags: [Admin]
 */
router.get('/users', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        isPendingApproval: true,
        createdAt: true,
      }
    });

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /admin/users/{id}/toggle-status:
 *   patch:
 *     summary: Toggle user active status (Admin only)
 *     tags: [Admin]
 */
router.patch('/users/:id/toggle-status', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: { id: true, isActive: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isActive: !user.isActive }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /admin/users/{id}/approve:
 *   post:
 *     summary: Approve a pending user registration (Admin only)
 *     tags: [Admin]
 */
router.post('/users/:id/approve', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: { id: true, isPendingApproval: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isActive: true, isPendingApproval: false }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

import bcrypt from 'bcryptjs';
import { getEnv } from '../config/env.js';

/**
 * @openapi
 * /admin/bootstrap:
 *   post:
 *     summary: Create the first admin user (requires ADMIN_BOOTSTRAP_SECRET header)
 *     tags: [Admin]
 */
router.post('/bootstrap', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const env = getEnv();
    const secret = env.ADMIN_BOOTSTRAP_SECRET;

    if (!secret) {
      return res.status(403).json({ success: false, error: 'Bootstrap is disabled (ADMIN_BOOTSTRAP_SECRET not set)' });
    }

    const providedSecret = req.headers['x-bootstrap-secret'];
    if (providedSecret !== secret) {
      return res.status(403).json({ success: false, error: 'Invalid bootstrap secret' });
    }

    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ success: false, error: 'email, password, and fullName are required' });
    }

    const prisma = getPrisma();
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await prisma.user.findUnique({ where: { email } });

    let user;
    if (existing) {
      // Update existing user's password, role, and active status
      user = await prisma.user.update({
        where: { email },
        data: { passwordHash, fullName, role: 'ADMIN', isActive: true },
      });
    } else {
      user = await prisma.user.create({
        data: { email, passwordHash, fullName, role: 'ADMIN', isActive: true },
      });
    }

    res.status(201).json({
      success: true,
      data: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /admin/users:
 *   post:
 *     summary: Create a new user (Admin only)
 *     tags: [Admin]
 */
router.post('/users', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fullName, email, password, role } = req.body;
    const prisma = getPrisma();

    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role: role || 'CLIENT',
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── API Status ──────────────────────────────────────────────────────────────
type SvcResult = Record<string, unknown> & { configured: boolean; status: 'online' | 'error' | 'unconfigured' };

function inferServiceFromModel(model: string): 'openai' | 'gemini' | 'groq' | 'cohere' | null {
  const m = model.toLowerCase();
  if (m.includes('gemini')) return 'gemini';
  if (m.includes('llama') || m.includes('groq')) return 'groq';
  if (m.includes('rerank') || m.includes('cohere')) return 'cohere';
  if (m.includes('gpt') || m.includes('text-embedding')) return 'openai';
  return null;
}

async function svcCloudinary(env: ReturnType<typeof getEnv>): Promise<SvcResult> {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return { configured: false, status: 'unconfigured' };
  }
  const auth = Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64');
  const r = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/usage`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as any;
  const storageLimit = Number(d.storage?.limit ?? 0);
  const bandwidthLimit = Number(d.bandwidth?.limit ?? 0);
  const transformationsLimit = Number(d.transformations?.limit ?? 0);
  return {
    configured: true, status: 'online',
    plan: d.plan ?? 'Free',
    storage: {
      usageBytes: d.storage?.usage ?? 0,
      limitBytes: storageLimit > 0 ? storageLimit : null,
      usedPercent: storageLimit > 0 ? +(d.storage?.used_percent ?? 0).toFixed(2) : null,
      isUnlimited: storageLimit <= 0,
    },
    bandwidth: {
      usageBytes: d.bandwidth?.usage ?? 0,
      limitBytes: bandwidthLimit > 0 ? bandwidthLimit : null,
      usedPercent: bandwidthLimit > 0 ? +(d.bandwidth?.used_percent ?? 0).toFixed(2) : null,
      isUnlimited: bandwidthLimit <= 0,
    },
    transformations: {
      usage: d.transformations?.usage ?? 0,
      limit: transformationsLimit > 0 ? transformationsLimit : null,
      usedPercent: transformationsLimit > 0 ? +(d.transformations?.used_percent ?? 0).toFixed(2) : null,
      isUnlimited: transformationsLimit <= 0,
    },
    resources: d.resources ?? 0,
    derivedResources: d.derived_resources ?? 0,
    lastUpdated: d.last_updated ?? null,
  };
}

async function svcPinecone(env: ReturnType<typeof getEnv>): Promise<SvcResult> {
  const { getPinecone, getPineconeIndex } = await import('../config/pinecone.js');
  const pc = getPinecone();
  const idx = getPineconeIndex();
  const [desc, stats] = await Promise.all([
    pc.describeIndex(env.PINECONE_INDEX_NAME),
    idx.describeIndexStats(),
  ]);
  const rawFullness = (stats as any).indexFullness;
  const indexFullness = typeof rawFullness === 'number' && rawFullness > 0 ? +rawFullness.toFixed(4) : null;
  return {
    configured: true, status: 'online',
    indexName: env.PINECONE_INDEX_NAME,
    vectorCount: stats.totalRecordCount ?? 0,
    indexFullness,
    fullnessReported: indexFullness !== null,
    dimension: (stats as any).dimension ?? desc.dimension,
    metric: desc.metric,
    host: desc.host,
  };
}

async function svcOpenAI(env: ReturnType<typeof getEnv>): Promise<SvcResult> {
  const headers = { Authorization: `Bearer ${env.OPENAI_API_KEY}` };
  const sig = AbortSignal.timeout(8000);

  // Check the key is valid via model lookup (fast)
  const modelResp = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(env.OPENAI_CHAT_MODEL_MINI)}`, { headers, signal: sig });
  if (!modelResp.ok) throw new Error(`HTTP ${modelResp.status}`);

  // Try billing credit-grants endpoint (works for prepaid/credits accounts)
  let creditBalance: number | null = null;
  let creditGranted: number | null = null;
  let creditUsed: number | null = null;
  let creditsExpire: string | null = null;
  try {
    const cgResp = await fetch('https://api.openai.com/v1/dashboard/billing/credit_grants', {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (cgResp.ok) {
      const cg = await cgResp.json() as any;
      creditGranted   = +(cg.total_granted   ?? 0);
      creditUsed      = +(cg.total_used       ?? 0);
      creditBalance   = +(cg.total_available  ?? (creditGranted - (creditUsed ?? 0)));
      const firstGrant = (cg.data ?? [])[0];
      if (firstGrant?.expires_at) {
        creditsExpire = new Date(firstGrant.expires_at * 1000).toISOString().slice(0, 10);
      }
    }
  } catch { /* billing endpoint not available for this account type */ }

  // Try monthly usage
  let monthlyUsageCents: number | null = null;
  try {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const end   = now.toISOString().slice(0, 10);
    const uResp = await fetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${start}&end_date=${end}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (uResp.ok) {
      const ud = await uResp.json() as any;
      monthlyUsageCents = ud.total_usage ?? null; // in cents
    }
  } catch { /* not available */ }

  return {
    configured: true, status: 'online',
    models: { chat: env.OPENAI_CHAT_MODEL, chatMini: env.OPENAI_CHAT_MODEL_MINI, embedding: env.OPENAI_EMBEDDING_MODEL },
    ...(creditBalance !== null  ? { creditBalance }  : {}),
    ...(creditGranted !== null  ? { creditGranted }  : {}),
    ...(creditUsed    !== null  ? { creditUsed }     : {}),
    ...(creditsExpire !== null  ? { creditsExpire }  : {}),
    ...(monthlyUsageCents !== null ? { monthlyUsageUsd: +(monthlyUsageCents / 100).toFixed(4) } : {}),
  };
}

async function svcGemini(env: ReturnType<typeof getEnv>): Promise<SvcResult> {
  if (!env.GEMINI_API_KEY) return { configured: false, status: 'unconfigured' };
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash', {
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return {
    configured: true, status: 'online',
    chatModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    voiceModel: 'gemini-2.0-flash-live-001',
    quotaVisibility: 'provider-does-not-expose-balance-via-api-key',
  };
}

async function svcGroq(env: ReturnType<typeof getEnv>): Promise<SvcResult> {
  if (!env.GROQ_API_KEY) return { configured: false, status: 'unconfigured' };
  const r = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return {
    configured: true, status: 'online',
    chatModels: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
    tier: 'Free',
    quotaVisibility: 'provider-does-not-expose-balance-via-api-key',
  };
}

async function svcCohere(env: ReturnType<typeof getEnv>): Promise<SvcResult> {
  if (!env.COHERE_API_KEY) return { configured: false, status: 'unconfigured' };
  const r = await fetch('https://api.cohere.com/v1/check-api-key', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.COHERE_API_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as any;
  return { configured: true, status: d.valid ? 'online' : 'error', usage: 'Reranking' };
}

router.get('/api-status', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const env = getEnv();
    const prisma = getPrisma();
    const unpack = <T>(r: PromiseSettledResult<T>): T =>
      r.status === 'fulfilled'
        ? r.value
        : ({ configured: true, status: 'error', error: String((r as PromiseRejectedResult).reason?.message ?? (r as PromiseRejectedResult).reason) } as T);

    // Self-tracked usage: last 30 days per service/model
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);

    const [cloudinary, pinecone, openai, gemini, groq, cohere, usageRows, answerUsageRows] = await Promise.allSettled([
      svcCloudinary(env),
      svcPinecone(env),
      svcOpenAI(env),
      svcGemini(env),
      svcGroq(env),
      svcCohere(env),
      prisma.apiUsageDay.findMany({
        where: { date: { gte: sinceStr } },
        orderBy: { date: 'desc' },
      }),
      prisma.answer.groupBy({
        by: ['modelUsed'],
        where: {
          createdAt: { gte: since },
          modelUsed: { not: null },
        },
        _count: { _all: true },
        _sum: { tokensUsed: true },
      }),
    ]);

    // Aggregate self-tracked usage by service
    const rows = usageRows.status === 'fulfilled' ? usageRows.value : [];
    const byService: Record<string, { requests: number; inputTokens: number; outputTokens: number; byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number }> }> = {};
    for (const row of rows) {
      const svc = byService[row.service] ??= { requests: 0, inputTokens: 0, outputTokens: 0, byModel: {} };
      svc.requests     += row.requests;
      svc.inputTokens  += row.inputTokens;
      svc.outputTokens += row.outputTokens;
      const mdl = svc.byModel[row.model] ??= { requests: 0, inputTokens: 0, outputTokens: 0 };
      mdl.requests     += row.requests;
      mdl.inputTokens  += row.inputTokens;
      mdl.outputTokens += row.outputTokens;
    }

    // Backfill from historical answers so dashboard shows usage immediately
    // even before any new tracked request happens after deployment.
    const answerRows = answerUsageRows.status === 'fulfilled' ? answerUsageRows.value : [];
    for (const row of answerRows) {
      const model = row.modelUsed;
      if (!model) continue;
      const service = inferServiceFromModel(model);
      if (!service) continue;
      const svc = byService[service] ??= { requests: 0, inputTokens: 0, outputTokens: 0, byModel: {} };
      const req = row._count._all ?? 0;
      const totalTokens = row._sum.tokensUsed ?? 0;
      svc.requests += req;
      // Historical answers store total tokens only; map into inputTokens bucket.
      svc.inputTokens += totalTokens;
      const mdl = svc.byModel[model] ??= { requests: 0, inputTokens: 0, outputTokens: 0 };
      mdl.requests += req;
      mdl.inputTokens += totalTokens;
    }

    res.json({
      success: true,
      data: {
        cloudinary: unpack(cloudinary),
        pinecone: unpack(pinecone),
        openai:   { ...unpack(openai),  selfTracked: byService['openai']  ?? null },
        gemini:   { ...unpack(gemini),  selfTracked: byService['gemini']  ?? null },
        groq:     { ...unpack(groq),    selfTracked: byService['groq']    ?? null },
        cohere:   { ...unpack(cohere),  selfTracked: byService['cohere']  ?? null },
        trackingPeriod: { from: sinceStr, to: new Date().toISOString().slice(0, 10) },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Question Analytics ──────────────────────────────────────────────────────
router.get('/question-analytics', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);

    // Run all queries in parallel
    const [totalQuestions, totalAnswered, totalGaps, dailyVolumeRaw, dailyGapsRaw, topUserGroups, recentGaps, recentQuestions] =
      await Promise.all([
        prisma.question.count(),
        prisma.answer.count(),
        prisma.answer.count({ where: { isGrounded: false } }),

        // Daily question volume (last 30 days) using raw SQL for date grouping
        prisma.$queryRaw<{ day: string; count: bigint }[]>`
          SELECT to_char(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                 COUNT(*)::bigint AS count
          FROM questions
          WHERE created_at >= ${since30}
          GROUP BY day
          ORDER BY day ASC
        `,

        // Daily gap counts (last 30 days)
        prisma.$queryRaw<{ day: string; count: bigint }[]>`
          SELECT to_char(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                 COUNT(*)::bigint AS count
          FROM answers
          WHERE is_grounded = false
            AND created_at >= ${since30}
          GROUP BY day
          ORDER BY day ASC
        `,

        // Top users by question count
        prisma.question.groupBy({
          by: ['userId'],
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        }),

        // Knowledge-gap answers — fetch many for deduplication
        prisma.answer.findMany({
          where: { isGrounded: false },
          include: {
            question: {
              include: { user: { select: { id: true, fullName: true, email: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 300,
        }),

        // Recent 500 questions for "most asked" grouping
        prisma.question.findMany({
          include: {
            user: { select: { id: true, fullName: true, email: true } },
            answer: { select: { isGrounded: true, confidenceScore: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);

    // Enrich top users with profile info
    const topUserDetails = await prisma.user.findMany({
      where: { id: { in: topUserGroups.map(u => u.userId) } },
      select: { id: true, fullName: true, email: true },
    });
    const userMap = new Map(topUserDetails.map(u => [u.id, u]));
    const topUsers = topUserGroups.map(u => ({
      userId: u.userId,
      fullName: userMap.get(u.userId)?.fullName ?? 'Unknown',
      email:    userMap.get(u.userId)?.email    ?? '',
      questionCount: u._count.id,
    }));

    // Group recent questions by normalised text for "most asked"
    const freq = new Map<string, { text: string; count: number; lastAsked: string; hadGap: boolean }>();
    for (const q of recentQuestions) {
      const key = q.queryText.toLowerCase().trim().substring(0, 150);
      const entry = freq.get(key);
      if (entry) {
        entry.count++;
        if (q.answer?.isGrounded === false) entry.hadGap = true;
        if (q.createdAt.toISOString() > entry.lastAsked) entry.lastAsked = q.createdAt.toISOString();
      } else {
        freq.set(key, {
          text: q.queryText,
          count: 1,
          lastAsked: q.createdAt.toISOString(),
          hadGap: q.answer?.isGrounded === false,
        });
      }
    }
    const topQuestions = [...freq.values()]
      .sort((a, b) => b.count - a.count || b.lastAsked.localeCompare(a.lastAsked))
      .slice(0, 50);

    // Deduplicate knowledge gaps by normalised question text
    const gapMap = new Map<string, { questionText: string; questionId: string; userId: string; userName: string; userEmail: string; askedAt: string; times: number }>();
    for (const a of recentGaps) {
      const key = a.question.queryText.toLowerCase().trim().substring(0, 150);
      const existing = gapMap.get(key);
      if (existing) {
        existing.times++;
        // keep the earliest occurrence as the canonical entry
      } else {
        gapMap.set(key, {
          questionId:   a.question.id,
          questionText: a.question.queryText,
          userId:       a.question.userId,
          userName:     a.question.user.fullName,
          userEmail:    a.question.user.email,
          askedAt:      a.question.createdAt.toISOString(),
          times:        1,
        });
      }
    }
    const uniqueGaps = [...gapMap.values()]
      .sort((a, b) => b.times - a.times || b.askedAt.localeCompare(a.askedAt));

    res.json({
      success: true,
      data: {
        summary: {
          totalQuestions:  Number(totalQuestions),
          totalAnswered:   Number(totalAnswered),
          knowledgeGaps:   Number(totalGaps),
          gapPercent:      totalAnswered > 0 ? Math.round((Number(totalGaps) / Number(totalAnswered)) * 100) : 0,
        },
        dailyVolume: (() => {
          const gapsMap = new Map<string, number>();
          for (const r of dailyGapsRaw) gapsMap.set(r.day, Number(r.count));
          return dailyVolumeRaw.map(r => ({
            day: r.day,
            total: Number(r.count),
            gaps: gapsMap.get(r.day) ?? 0,
          }));
        })(),
        topUsers,
        recentGaps: uniqueGaps,
        topQuestions,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /admin/clear-qa-history
 * Permanently delete all questions (cascades to answers, sources, images) and API usage rows.
 * Requires admin JWT + x-bootstrap-secret header for extra safety.
 */
router.delete('/clear-qa-history', authenticate, requireRole(UserRole.ADMIN as any), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = (process.env.ADMIN_BOOTSTRAP_SECRET || '').trim();
    if (!secret) {
      return res.status(403).json({ success: false, error: 'ADMIN_BOOTSTRAP_SECRET not set on this server' });
    }
    const provided = req.headers['x-bootstrap-secret'];
    if (provided !== secret) {
      return res.status(403).json({ success: false, error: 'Invalid bootstrap secret' });
    }

    const prisma = getPrisma();
    const [delQ, delUsage] = await Promise.all([
      prisma.question.deleteMany({}),
      prisma.apiUsageDay.deleteMany({}),
    ]);

    res.json({
      success: true,
      data: {
        deletedQuestions: delQ.count,
        deletedApiUsageDays: delUsage.count,
        note: 'All answers, sources and images were cascade-deleted with the questions.',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /admin/insert-knowledge:
 *   post:
 *     summary: Insert a new knowledge entry from rich text (Admin only)
 *     tags: [Admin]
 */
router.post(
  '/insert-knowledge',
  authenticate,
  requireRole(UserRole.ADMIN as any),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, category, htmlContent } = req.body;

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        throw new BadRequestError('Title is required');
      }
      if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.replace(/<[^>]+>/g, '').trim().length === 0) {
        throw new BadRequestError('Content is required');
      }

      const prisma = getPrisma();
      const safeTitle = title.trim().substring(0, 200);
      const safeCategory = typeof category === 'string' && category.trim() ? category.trim() : 'GENERAL';

      // Create the document record first
      const newDoc = await prisma.document.create({
        data: {
          title: safeTitle,
          originalFilename: `${safeTitle}.txt`,
          storedFilename: '',
          filePath: '',
          mimeType: 'text/html',
          fileSizeBytes: Buffer.byteLength(htmlContent, 'utf8'),
          categories: [safeCategory],
          status: 'PROCESSING',
          uploadedBy: req.user!.userId,
        },
      });

      // Process text synchronously (fast — no PDF rendering or vision)
      await processTextContent(newDoc.id, htmlContent);

      // Return the final document state
      const finalDoc = await prisma.document.findUnique({
        where: { id: newDoc.id },
        select: {
          id: true,
          title: true,
          status: true,
          categories: true,
          fileSizeBytes: true,
          pageCount: true,
          progress: true,
          metadata: true,
          createdAt: true,
        },
      });

      res.status(201).json({ success: true, data: finalDoc });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
