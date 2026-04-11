/**
 * Embedding service — OpenAI primary, Gemini REST fallback.
 *
 * Pinecone index is 1536 dims. OpenAI text-embedding-3-small produces 1536.
 * Gemini gemini-embedding-2-preview supports outputDimensionality — we request 1536.
 * Gemini gemini-embedding-001 as last-resort fallback (also supports 1536).
 *
 * Gemini free tier has strict RPM limits so we batch in groups of 20
 * and retry with exponential backoff on 429.
 */
import { getOpenAI } from '../config/openai.js';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';

const TARGET_DIMS = 1536;
const GEMINI_BATCH_SIZE = 20;     // texts per sub-batch to stay within free-tier limits
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2_000; // 2s, doubles each retry (2→4→8→16→32s)

/** Sticky flag — once OpenAI quota is exhausted this run, skip it */
let openaiExhausted = false;

/** Sleep helper */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Call a single Gemini batchEmbedContents with retry on 429 */
async function geminiBatchWithRetry(
  model: string,
  texts: string[],
  geminiKey: string,
): Promise<number[][] | null> {
  const logger = getLogger();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${geminiKey}`;
  const body = {
    requests: texts.map(text => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      outputDimensionality: TARGET_DIMS,
    })),
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      const data = await resp.json() as any;
      const embeddings: number[][] = (data.embeddings ?? []).map((e: any) => e.values as number[]);
      if (embeddings.length === texts.length && embeddings[0]?.length) {
        return embeddings;
      }
    }

    const status = resp.status;
    if (status === 429 && attempt < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      logger.warn(`Gemini ${model} rate-limited (429), retry ${attempt + 1}/${MAX_RETRIES} in ${backoff}ms`);
      await sleep(backoff);
      continue;
    }

    // Non-429 or exhausted retries — return null to try next model
    const errText = await resp.text().catch(() => status.toString());
    logger.warn(`Gemini ${model} returned ${status}: ${errText.slice(0, 200)}`);
    return null;
  }
  return null;
}

async function geminiEmbedBatch(texts: string[], geminiKey: string): Promise<number[][]> {
  const logger = getLogger();
  const models = ['gemini-embedding-2-preview', 'gemini-embedding-001'];

  for (const model of models) {
    const allEmbeddings: number[][] = [];
    let failed = false;

    // Process in sub-batches to respect free-tier RPM limits
    for (let i = 0; i < texts.length; i += GEMINI_BATCH_SIZE) {
      const batch = texts.slice(i, i + GEMINI_BATCH_SIZE);
      const result = await geminiBatchWithRetry(model, batch, geminiKey);
      if (!result) {
        logger.warn(`Gemini ${model} failed at sub-batch ${i}/${texts.length} — trying next model`);
        failed = true;
        break;
      }
      allEmbeddings.push(...result);

      // Small delay between sub-batches to stay under RPM
      if (i + GEMINI_BATCH_SIZE < texts.length) {
        await sleep(500);
      }
    }

    if (!failed && allEmbeddings.length === texts.length) {
      logger.info(`Gemini ${model}: ${allEmbeddings[0].length}d × ${allEmbeddings.length}`);
      return allEmbeddings;
    }
  }

  throw new Error('All Gemini embedding models exhausted after retries — cannot embed');
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
