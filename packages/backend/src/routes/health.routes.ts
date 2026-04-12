import { Router, Request, Response } from 'express';
import { getPrisma } from '../config/database.js';

const router: Router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Basic health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
  });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     summary: Readiness check (includes DB connectivity)
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service and dependencies are ready
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      data: {
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    res.status(503).json({
      success: false,
      error: {
        code: 'NOT_READY',
        message: 'Service dependencies are not ready',
      },
    });
  }
});

// Temporary diagnostic endpoint - check DB image/chunk counts
router.get('/diag', async (_req: Request, res: Response) => {
  const prisma = getPrisma();
  const [docs, chunks, images, visualChunks] = await Promise.all([
    prisma.document.findMany({ select: { id: true, title: true, status: true, pageCount: true, originalFilename: true } }),
    prisma.documentChunk.count(),
    prisma.documentImage.count(),
    prisma.documentChunk.count({ where: { chunkIndex: { gte: 999 } } }),
  ]);
  // Sample image descriptions
  const sampleImages = await prisma.documentImage.findMany({
    select: { pageNumber: true, description: true, filePath: true, pineconeVectorId: true },
    take: 5,
    orderBy: { pageNumber: 'asc' },
  });
  res.json({
    documents: docs,
    totalChunks: chunks,
    visualChunks,
    totalImages: images,
    sampleImages,
  });
});

export default router;
