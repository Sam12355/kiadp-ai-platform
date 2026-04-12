import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { getEnv } from './config/env.js';
import { swaggerSpec } from './config/swagger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import routes from './routes/index.js';

export function createApp(): Express {
  const env = getEnv();
  const app = express();

  // ── Security ──
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https://res.cloudinary.com'],
      },
    },
  }));
  app.use(cors({
    origin: env.CORS_ORIGIN.split(',').map(s => s.trim()),
    credentials: true,
  }));

  // ── Rate limiting ──
  app.use('/api/', generalLimiter);

  // ── Body parsing ──
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Request logging ──
  app.use(requestLogger);

  // ── Static files (uploaded images) ──
  app.use('/uploads', express.static(env.UPLOAD_DIR));

  // ── API Documentation ──
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Khalifa Knowledge Platform API',
  }));

  // ── API Routes ──
  app.use('/api/v1', routes);

  // ── SPA Static Serving (serves built frontend) ──
  const appDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.join(appDir, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('/*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // ── Error handler (must be last) ──
  app.use(errorHandler);

  return app;
}
