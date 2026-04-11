/**
 * Embedding service — OpenAI primary, Gemini REST fallback.
 *
 * Pinecone index is 1536 dims. OpenAI text-embedding-3-small produces 1536.
 * Gemini gemini-embedding-2-preview supports outputDimensionality — we request 1536.
 * Gemini gemini-embedding-001 as last-resort fallback (also supports 1536).
 */
import { getOpenAI } from '../config/openai.js';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';

const TARGET_DIMS = 1536;

/** Sticky flag — once OpenAI quota is exhausted this run, skip it */
let openaiExhausted = false;

async function geminiEmbedBatch(texts: string[], geminiKey: string): Promise<number[][]> {
  const logger = getLogger();

  // Try gemini-embedding-2-preview (1536 dims) via v1beta REST
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:batchEmbedContents?key=${geminiKey}`;
    const body = {
      requests: texts.map(text => ({
        model: 'models/gemini-embedding-2-preview',
        content: { parts: [{ text }] },
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
        logger.info(`Gemini embedding-2-preview: ${embeddings[0].length}d × ${embeddings.length}`);
        return embeddings;
      }
    }
    const errText = await resp.text().catch(() => resp.status.toString());
    logger.warn(`Gemini embedding-2-preview returned ${resp.status}: ${errText.slice(0, 200)} — falling back to gemini-embedding-001`);
  } catch (err: any) {
    logger.warn(`Gemini embedding-2-preview failed: ${err.message} — falling back to gemini-embedding-001`);
  }

  // Fall back to gemini-embedding-001 (also supports 1536 via outputDimensionality)
  const url2 = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${geminiKey}`;
  const body2 = {
    requests: texts.map(text => ({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      outputDimensionality: TARGET_DIMS,
    })),
  };
  const resp2 = await fetch(url2, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body2),
  });
  if (!resp2.ok) {
    const errText = await resp2.text().catch(() => resp2.status.toString());
    throw new Error(`Gemini embedding-001 failed (${resp2.status}): ${errText.slice(0, 200)}`);
  }
  const data2 = await resp2.json() as any;
  return (data2.embeddings ?? []).map((e: any) => e.values as number[]);
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
