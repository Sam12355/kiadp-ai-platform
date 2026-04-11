/**
 * Embedding service — OpenAI primary, Gemini REST fallback.
 *
 * Pinecone index is 1536 dims. OpenAI text-embedding-3-small produces 1536.
 * Gemini gemini-embedding-exp-03-07 supports up to 3072, we request 1536.
 * Gemini text-embedding-004 is only 768 — zero-padded to 1536 as last resort.
 */
import { getOpenAI } from '../config/openai.js';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';

const TARGET_DIMS = 1536;

/** Sticky flag — once OpenAI quota is exhausted this run, skip it */
let openaiExhausted = false;

async function geminiEmbedBatch(texts: string[], geminiKey: string): Promise<number[][]> {
  const logger = getLogger();

  // Try experimental model (1536 dims) via direct REST — bypasses SDK apiVersion bug
  try {
    const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-embedding-exp-03-07:batchEmbedContents?key=${geminiKey}`;
    const body = {
      requests: texts.map(text => ({
        model: 'models/gemini-embedding-exp-03-07',
        content: { role: 'user', parts: [{ text }] },
        outputDimensionality: TARGET_DIMS,
      })),
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      const embeddings: number[][] = (data.embeddings ?? []).map((e: any) => e.values as number[]);
      if (embeddings.length === texts.length && embeddings[0]?.length) {
        logger.info(`Gemini exp embedding: ${embeddings[0].length}d × ${embeddings.length}`);
        return embeddings;
      }
    }
    const errText = await resp.text().catch(() => resp.status.toString());
    logger.warn(`Gemini exp embedding returned ${resp.status}: ${errText.slice(0, 200)} — falling back to text-embedding-004`);
  } catch (err: any) {
    logger.warn(`Gemini exp embedding failed: ${err.message} — falling back to text-embedding-004`);
  }

  // Fall back to text-embedding-004 (768 dims) — zero-pad to 1536
  logger.warn('Using text-embedding-004 (768d) zero-padded to 1536d');
  const url2 = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${geminiKey}`;
  const body2 = {
    requests: texts.map(text => ({
      model: 'models/text-embedding-004',
      content: { role: 'user', parts: [{ text }] },
    })),
  };
  const resp2 = await fetch(url2, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body2),
  });
  if (!resp2.ok) {
    const errText = await resp2.text().catch(() => resp2.status.toString());
    throw new Error(`Gemini text-embedding-004 failed (${resp2.status}): ${errText.slice(0, 200)}`);
  }
  const data2 = await resp2.json() as any;
  return (data2.embeddings ?? []).map((e: any) => {
    const v: number[] = e.values as number[];
    // Zero-pad from 768 to 1536 to match Pinecone index dimensions
    while (v.length < TARGET_DIMS) v.push(0);
    return v;
  });
}

/**
 * Embed a batch of texts. OpenAI primary, Gemini REST fallback on 429.
 * Always returns 1536-dim vectors.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const env = getEnv();
  const logger = getLogger();

  // ── Try OpenAI ──
  if (!openaiExhausted) {
    try {
      const openai = getOpenAI();
      const response = await openai.embeddings.create({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: texts,
      });
      return response.data.map(d => d.embedding);
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      if (status === 429) {
        logger.warn('OpenAI embeddings quota exceeded (429) — switching to Gemini for remaining embeddings this run');
        openaiExhausted = true;
      } else {
        throw err;
      }
    }
  }

  // ── Fallback: Gemini ──
  const geminiKey = env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error('OpenAI quota exceeded and GEMINI_API_KEY is not set — cannot generate embeddings');
  }
  return geminiEmbedBatch(texts, geminiKey);
}

/** Single-text convenience wrapper. */
export async function embedText(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  return results[0];
}
