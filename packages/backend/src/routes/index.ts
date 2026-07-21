import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import documentRoutes from './document.routes.js';
import qaRoutes from './qa.routes.js';
import adminRoutes from './admin.routes.js';
import whatsappRoutes from './whatsapp.routes.js';
import askRoutes from './ask.routes.js';
import tenantRoutes from './tenant.routes.js';
import moodleRoutes from './moodle.routes.js';

const router: Router = Router();

// System
router.use('/health', healthRoutes);

// Auth
router.use('/auth', authRoutes);

// Documents
router.use('/documents', documentRoutes);

// WhatsApp Bot
router.use('/whatsapp', whatsappRoutes);

// Knowledge / QA
router.use('/knowledge', qaRoutes);

// Admin
router.use('/admin', adminRoutes);

// Institution (tenant) management — admin only
router.use('/tenants', tenantRoutes);

// External integrations (n8n, etc.) — no auth required
router.use('/ask', askRoutes);

// Moodle plugin integration
router.use('/moodle', moodleRoutes);

export default router;
