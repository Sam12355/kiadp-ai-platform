import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import documentRoutes from './document.routes.js';
import qaRoutes from './qa.routes.js';
import adminRoutes from './admin.routes.js';
import chatRoutes from './chat.routes.js';

const router: Router = Router();

// System
router.use('/health', healthRoutes);

// Auth
router.use('/auth', authRoutes);

// Documents
router.use('/documents', documentRoutes);

// Knowledge / QA
router.use('/knowledge', qaRoutes);

// Chat / History
router.use('/chat', chatRoutes);

// Admin
router.use('/admin', adminRoutes);

export default router;
