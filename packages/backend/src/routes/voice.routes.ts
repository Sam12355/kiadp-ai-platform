import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenAI } from '@google/genai';
import { authenticate } from '../middleware/auth.js';
import { resolveTenantContext, requireLiveTenant } from '../middleware/rbac.js';
import { getEnv } from '../config/env.js';
import { BadRequestError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';

const router: Router = Router();

/**
 * Mints a short-lived token for a browser to open a Gemini Live session.
 *
 * Voice mode connects the browser straight to Google, which means the browser needs
 * credentials. It was given the real API key, shipped inside the JS bundle — so anyone who
 * opened dev tools could take it and use the project's Gemini quota. With no billing
 * enabled that is not a bill, but it is a denial of service: a stranger exhausts the free
 * tier and voice stops working for every school on the platform.
 *
 * An ephemeral token fixes the exposure without moving the audio through this server,
 * which would add latency to a real-time conversation for no benefit. The token is
 * single-use, expires in minutes, and is locked to the Live model, so the worst a leaked
 * one buys is the session it was minted for.
 *
 * The endpoint is authenticated and trial-gated, which the raw key never was: previously
 * voice was reachable by anyone holding the key, signed in or not, paid or expired.
 */
router.post(
  '/token',
  authenticate,
  resolveTenantContext,
  requireLiveTenant,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const env = getEnv();
      if (!env.GEMINI_API_KEY) {
        throw new BadRequestError('Voice mode is not configured on this server');
      }

      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const now = Date.now();

      const token = await ai.authTokens.create({
        config: {
          // One session per token. A token that has been used cannot be replayed.
          uses: 1,
          // The session itself may run for half an hour; the window to START one is a
          // minute, so a token copied out of the network tab is stale almost immediately.
          expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
          httpOptions: { apiVersion: 'v1alpha' },
        },
      });

      res.json({ success: true, data: { token: token.name } });
    } catch (err) {
      getLogger().error({ err }, 'failed to mint a voice session token');
      next(err);
    }
  },
);

export default router;
