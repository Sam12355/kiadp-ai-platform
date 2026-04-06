import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { UserRole } from '@prisma/client';

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

import bcrypt from 'bcrypt';

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

export default router;
