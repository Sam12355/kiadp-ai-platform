import { getPrisma } from '../config/database.js';
import { getLogger } from './logger.js';

/**
 * Upsert aggregated daily token/request counts.
 * Fire-and-forget — errors are logged but never thrown so they never break
 * the primary API call path.
 */
export function trackUsage(
  service: 'openai' | 'gemini' | 'groq' | 'cohere',
  model: string,
  inputTokens: number,
  outputTokens: number,
): void {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const prisma = getPrisma();
  prisma.apiUsageDay.upsert({
    where: { date_service_model: { date, service, model } },
    create: { date, service, model, requests: 1, inputTokens, outputTokens },
    update: {
      requests:     { increment: 1 },
      inputTokens:  { increment: inputTokens },
      outputTokens: { increment: outputTokens },
    },
  }).catch((err: unknown) => {
    getLogger().warn({ err }, 'Failed to track API usage');
  });
}
