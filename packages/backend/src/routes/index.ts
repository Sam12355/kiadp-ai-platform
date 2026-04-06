import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import documentRoutes from './document.routes.js';
import qaRoutes from './qa.routes.js';
import adminRoutes from './admin.routes.js';

const router: Router = Router();

// System
router.use('/health', healthRoutes);

// Auth
router.use('/auth', authRoutes);

// Documents
router.use('/documents', documentRoutes);

// Knowledge / QA
router.use('/knowledge', qaRoutes);

// Admin
router.use('/admin', adminRoutes);

export default router;
