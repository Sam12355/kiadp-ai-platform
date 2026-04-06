import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as qaController from '../controllers/qa.controller.js';

const router: Router = Router();

/**
 * @openapi
 * /knowledge/ask:
 *   post:
 *     summary: Ask a question and get a grounded answer
 *     tags: [Knowledge]
 *     security:
 *       - BearerAuth: []
 */
router.post('/ask', authenticate, qaController.ask);

export default router;
