import { Request, Response, NextFunction } from 'express';
import { getPrisma } from '../config/database.js';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const updateSessionSchema = z.object({
  title: z.string().min(1).max(100),
});

export async function getSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const prisma = getPrisma();
    const userId = req.user!.userId;

    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
          id: true,
          title: true,
          updatedAt: true
      }
    });

    res.json({ success: true, data: { items: sessions } });
  } catch (err) {
    next(err);
  }
}

export async function getSessionMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const prisma = getPrisma();
    const { id } = req.params;
    const userId = req.user!.userId;

    const session = await prisma.chatSession.findUnique({
      where: { id, userId },
      include: {
        questions: {
          orderBy: { createdAt: 'asc' },
          include: {
            answer: {
              include: {
                sources: {
                  include: { chunk: { include: { document: { select: { title: true, originalFilename: true, storedFilename: true } } } } }
                },
                answerImages: { include: { image: true } }
              }
            }
          }
        }
      }
    });

    if (!session) throw new NotFoundError('Session not found');

    // Flatten to "Messages" for the frontend
    const messages: any[] = [];
    session.questions.forEach(q => {
      messages.push({
        id: q.id,
        role: 'user',
        content: q.queryText,
        createdAt: q.createdAt
      });
      if (q.answer) {
        messages.push({
          id: q.answer.id,
          role: 'assistant',
          content: q.answer.answerText,
          isGrounded: q.answer.isGrounded,
          createdAt: q.answer.createdAt,
          sources: q.answer.sources.map((s: any) => ({
             id: s.id,
             documentId: s.documentId,
             pageNumber: s.pageNumber,
             excerpt: s.excerpt,
             relevanceScore: s.relevanceScore,
             sourceDocument: {
               title: s.chunk.document.title,
               originalFilename: s.chunk.document.originalFilename,
               storedFilename: s.chunk.document.storedFilename
             }
          })),
          images: q.answer.answerImages.map((ai: any) => ({
             id: ai.image.id,
             url: ai.image.filePath,
             description: ai.image.description,
             pageNumber: ai.image.pageNumber
          }))
        });
      }
    });

    res.json({ success: true, data: { items: messages } });
  } catch (err) {
    next(err);
  }
}

export async function updateSession(req: Request, res: Response, next: NextFunction) {
  try {
    const prisma = getPrisma();
    const { id } = req.params;
    const userId = req.user!.userId;

    const parseResult = updateSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }

    const session = await prisma.chatSession.update({
      where: { id, userId },
      data: { title: parseResult.data.title }
    });

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function deleteSession(req: Request, res: Response, next: NextFunction) {
  try {
    const prisma = getPrisma();
    const { id } = req.params;
    const userId = req.user!.userId;

    await prisma.chatSession.delete({
      where: { id, userId }
    });

    res.json({ success: true, message: 'Session deleted' });
  } catch (err) {
    next(err);
  }
}
