import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router: Router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new client user
 *     tags: [Auth]
 */
router.post('/register', authLimiter, authController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 */
router.post('/login', authLimiter, authController.login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 */
router.post('/refresh', authLimiter, authController.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Logout and revoke refresh tokens
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user profile
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 */
router.get('/me', authenticate, authController.me);

import { avatarUpload } from '../config/multer.profile.js';

/**
 * @openapi
 * /auth/profile:
 *   patch:
 *     summary: Update current user profile
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 */
router.patch('/profile', authenticate, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    const { fullName, email } = req.body;
    const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : undefined;
    
    const prisma = (await import('../config/database.js')).getPrisma();
    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(fullName && { fullName }),
        ...(email && { email }),
        ...(avatarUrl && { avatarUrl }),
      }
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        avatarUrl: updated.avatarUrl,
        role: updated.role
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
