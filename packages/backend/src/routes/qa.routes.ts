import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveTenantContext, requireLiveTenant, requireQuota } from '../middleware/rbac.js';
import * as qaController from '../controllers/qa.controller.js';

const router: Router = Router();

// resolveTenantContext resolves the caller's institution once and, for a super admin
// using "view as", narrows it to the one they are viewing. Without it here the chat
// answers from the caller's own scope, so previewing a school's student experience would
// quietly search every school's documents — the one thing the preview exists to show.
router.use(authenticate, resolveTenantContext, requireLiveTenant, requireQuota);

/**
 * @openapi
 * /knowledge/ask:
 *   post:
 *     summary: Ask a question and get a grounded answer
 *     tags: [Knowledge]
 *     security:
 *       - BearerAuth: []
 */
router.post('/ask', qaController.ask);
router.post('/search', qaController.search);
router.post('/voice-ask', qaController.voiceAskHandler);

export default router;
