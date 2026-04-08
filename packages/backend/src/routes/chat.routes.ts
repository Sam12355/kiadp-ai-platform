import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as chatController from '../controllers/chat.controller.js';

const router: Router = Router();

/**
 * @openapi
 * /chat/sessions:
 *   get:
 *     summary: Get all chat sessions for the current user
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.get('/sessions', authenticate, chatController.getSessions);

/**
 * @openapi
 * /chat/sessions/{id}/messages:
 *   get:
 *     summary: Get all messages for a specific session
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.get('/sessions/:id/messages', authenticate, chatController.getSessionMessages);

/**
 * @openapi
 * /chat/sessions/{id}:
 *   patch:
 *     summary: Rename a specific session
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.patch('/sessions/:id', authenticate, chatController.updateSession);

/**
 * @openapi
 * /chat/sessions/{id}:
 *   delete:
 *     summary: Delete a specific session
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.delete('/sessions/:id', authenticate, chatController.deleteSession);

export default router;
