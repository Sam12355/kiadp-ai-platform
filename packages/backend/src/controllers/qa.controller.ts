import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../utils/errors.js';
import { askQuestion, searchKnowledge, voiceAsk } from '../services/qa.service.js';
import { getPrisma } from '../config/database.js';

const askSchema = z.object({
  question: z.string().min(1, 'Question must be provided'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
  language: z.string().optional(),
  mode: z.enum(['grounded', 'general']).optional(),
});

async function getUserTenantId(userId: string): Promise<string | undefined> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  return user?.tenantId ?? undefined;
}

export async function ask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = askSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }

    const userId = req.user!.userId;
    const { question, history, language, mode } = parseResult.data;
    const tenantId = await getUserTenantId(userId);
    const result = await askQuestion(userId, question, history || [], language, mode as any, tenantId);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

const searchSchema = z.object({
  query: z.string().min(1, 'Query must be provided'),
});

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = searchSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }
    const fast = req.query.fast === 'true';
    const tenantId = await getUserTenantId(req.user!.userId);
    const result = await searchKnowledge(parseResult.data.query, fast, tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

const voiceAskSchema = z.object({
  query: z.string().min(1, 'Query must be provided'),
  language: z.string().optional(),
  // The caller's untouched words. Voice mode's tool call rewrites the request into
  // keywords, which loses phrasing like "read it as it is"; this preserves that intent.
  userRequest: z.string().optional(),
});

export async function voiceAskHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = voiceAskSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }
    const { query, language, userRequest } = parseResult.data;
    const tenantId = await getUserTenantId(req.user!.userId);
    const result = await voiceAsk(query, language, tenantId, undefined, userRequest);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
