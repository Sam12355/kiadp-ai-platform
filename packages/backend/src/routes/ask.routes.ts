import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { askQuestion } from '../services/qa.service.js';
import { getPrisma } from '../config/database.js';
import { getLogger } from '../utils/logger.js';
import { authenticateApiKey } from '../middleware/api-key.middleware.js';

const router: Router = Router();
const logger = getLogger();

const askSchema = z.object({
  question: z.string().min(1, 'question is required'),
  language: z.string().optional(),
  mode: z.enum(['grounded', 'general']).optional(),
  courseId: z.string().optional(),
});

/**
 * POST /api/v1/ask
 * External integration endpoint — requires a valid API key.
 * The key determines which institution's knowledge base is searched.
 *
 * Headers:
 *   Authorization: Bearer sk-kh-<key>
 *
 * Body:
 *   { "question": "...", "language": "en", "mode": "grounded" }
 *
 * Response:
 *   { "answer": "...", "sources": [...] }
 */
router.post('/', authenticateApiKey, async (req: Request, res: Response) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { question, language, mode, courseId } = parsed.data;
  const tenantId = req.apiKey!.tenantId ?? undefined;

  try {
    const prisma = getPrisma();

    // Each tenant gets its own system user so Q&A records are properly associated.
    // For platform-level keys (no tenantId) a shared system user is used.
    const systemEmail = tenantId
      ? `api-system+${tenantId}@system.local`
      : 'api-system@system.local';

    let user = await prisma.user.findUnique({ where: { email: systemEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: systemEmail,
          passwordHash: 'api-system-no-login',
          fullName: 'API System User',
          role: 'STUDENT',
          isActive: true,
          ...(tenantId ? { tenantId } : {}),
        },
      });
    }

    const result = await askQuestion(user.id, question, [], language ?? 'en', mode ?? 'grounded', tenantId, courseId);

    res.json({
      answer: result.answerText,
      sources: result.sources.map(s => ({
        document: s.sourceDocument.title,
        page: s.pageNumber,
        excerpt: s.excerpt,
      })),
      isGrounded: result.isGrounded,
    });
  } catch (err) {
    logger.error({ err }, '/ask endpoint error');
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
