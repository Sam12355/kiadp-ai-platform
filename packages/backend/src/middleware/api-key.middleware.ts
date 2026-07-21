import { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import { getPrisma } from '../config/database.js';
import { getLogger } from '../utils/logger.js';

export interface ApiKeyPayload {
  id: string;
  name: string;
  tenantId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyPayload;
    }
  }
}

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Middleware: validates a Bearer API key (format: sk-kh-<hex>).
 * Attaches req.apiKey with tenantId so downstream handlers can scope queries.
 * Updates lastUsedAt and requestCount as a fire-and-forget operation.
 */
export async function authenticateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;

  if (!auth?.startsWith('Bearer sk-kh-')) {
    res.status(401).json({ error: 'A valid API key is required. Format: Authorization: Bearer sk-kh-<key>' });
    return;
  }

  const rawKey = auth.slice(7); // strip "Bearer "
  const hash = hashKey(rawKey);
  const prisma = getPrisma();

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash: hash },
      select: { id: true, name: true, tenantId: true, isActive: true, expiresAt: true },
    });

    if (!apiKey || !apiKey.isActive) {
      res.status(401).json({ error: 'Invalid or revoked API key.' });
      return;
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      res.status(401).json({ error: 'This API key has expired.' });
      return;
    }

    req.apiKey = { id: apiKey.id, name: apiKey.name, tenantId: apiKey.tenantId };

    // Fire-and-forget — don't block the request on this update
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
    }).catch(err => getLogger().warn({ err }, 'Failed to update API key usage'));

    next();
  } catch (err) {
    getLogger().error({ err }, 'API key authentication error');
    res.status(500).json({ error: 'Internal server error during authentication.' });
  }
}

/**
 * Generates a new raw API key and its hash.
 * The raw key is returned ONCE and must be shown to the user immediately.
 * Only the hash is stored in the database.
 */
export function generateApiKey(): { rawKey: string; hash: string; prefix: string } {
  const secret = randomBytes(24).toString('hex'); // 48 hex chars
  const rawKey = `sk-kh-${secret}`;
  const hash = hashKey(rawKey);
  const prefix = rawKey.slice(0, 14); // "sk-kh-" + first 8 hex chars
  return { rawKey, hash, prefix };
}
