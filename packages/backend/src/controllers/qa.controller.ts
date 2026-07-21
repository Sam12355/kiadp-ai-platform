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

/**
 * The institution whose documents this request may search.
 *
 * Read from the request rather than looked up from the user, because resolveTenantContext
 * has already done that lookup AND applied "view as" if a super admin is previewing an
 * institution. Reading the user directly would ignore the preview and search everything.
 */
function scopeTenantId(req: Request): string | undefined {
  return req.callerTenantId ?? undefined;
}

export async function ask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = askSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }

    const userId = req.user!.userId;
    const { question, history, language, mode } = parseResult.data;
    const tenantId = scopeTenantId(req);
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
    const tenantId = scopeTenantId(req);
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
  /** Set by the voice tool call when the user asked for the source text itself. */
  verbatim: z.boolean().optional(),
});

export async function voiceAskHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = voiceAskSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }
    const { query, language, userRequest, verbatim } = parseResult.data;
    const tenantId = scopeTenantId(req);
    const result = await voiceAsk(query, language, tenantId, undefined, userRequest, verbatim);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
