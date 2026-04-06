import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../utils/errors.js';
import { askQuestion } from '../services/qa.service.js';

const askSchema = z.object({
  question: z.string().min(1, 'Question must be provided'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
  language: z.string().optional(),
  mode: z.enum(['grounded', 'general']).optional(),
});

export async function ask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = askSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }

    const userId = req.user!.userId;
    const { question, history, language, mode } = parseResult.data;
    const result = await askQuestion(userId, question, history || [], language, mode as any);
    
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
