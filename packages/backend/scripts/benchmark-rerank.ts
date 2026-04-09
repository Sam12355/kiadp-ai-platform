/**
 * benchmark-rerank.ts
 *
 * Fair A/B comparison: same 4 queries, same candidate chunks, timed independently
 * for Cohere rerank-v3.5 vs GPT-4o-mini scoring.
 *
 * Usage: npx tsx scripts/benchmark-rerank.ts
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { CohereClient } from 'cohere-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL_MINI || 'gpt-4o-mini';

const QUERIES = [
  'what is the dish they have in siwa',
  'population of siwa in 2016',
  'what are the main pests affecting date palms',
  'tell me about the irrigation system in siwa',
];

// ── Candidate retrieval (same as production: pgvector top-30 text-only) ──

async function getCandidates(query: string): Promise<{ text: string; pageNumber: number; score: number }[]> {
  const embedResp = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: query });
  const vec = embedResp.data[0].embedding;
  const vectorStr = `[${vec.join(',')}]`;

  type Row = { content: string; page_number: number; similarity: number };
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT dc.content, dc.page_number,
           1 - (dc.embedding <=> '${vectorStr}'::vector) AS similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL AND dc.chunk_index < 999
    ORDER BY dc.embedding <=> '${vectorStr}'::vector
    LIMIT 30
  `);

  return rows.map(r => ({ text: r.content, pageNumber: r.page_number, score: r.similarity }));
}

// ── Cohere reranker ──

async function rerankCohere(
  query: string,
  chunks: { text: string; pageNumber: number; score: number }[],
  topN = 8
): Promise<{ text: string; pageNumber: number; rerankScore: number }[]> {
  const resp = await cohere.v2.rerank({
    model: 'rerank-v3.5',
    query,
    documents: chunks.map(c => c.text.substring(0, 800)),
    topN,
  });
  return resp.results.map(r => ({
    ...chunks[r.index],
    rerankScore: r.relevanceScore,
  }));
}

// ── GPT-4o-mini reranker ──

async function rerankGPT(
  query: string,
  chunks: { text: string; pageNumber: number; score: number }[],
  topN = 8
): Promise<{ text: string; pageNumber: number; rerankScore: number }[]> {
  const chunkList = chunks.map((c, i) => `[${i}] ${c.text.substring(0, 300)}`).join('\n\n');

  const resp = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a relevance scoring assistant. Given a user query and numbered text passages, rate each passage's relevance to answering the query.

Score each passage 0-10:
- 9-10: Directly answers the query with specific facts
- 6-8: Contains clearly related information
- 3-5: Tangentially related
- 0-2: Not relevant

Return a JSON object with a "rankings" key containing an array of {index, score} objects. Example:
{"rankings": [{"index": 3, "score": 9}, {"index": 0, "score": 7}, {"index": 1, "score": 2}]}

Include ALL passages in the rankings. Be strict — only passages with direct, useful information should score 7+.`,
      },
      { role: 'user', content: `Query: "${query}"\n\nPassages:\n${chunkList}` },
    ],
    temperature: 0,
  });

  const content = resp.choices[0].message.content || '{}';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return chunks.slice(0, topN).map(c => ({ ...c, rerankScore: 0.5 }));

  const parsed = JSON.parse(jsonMatch[0]);
  const scores: { index: number; score: number }[] =
    Array.isArray(parsed) ? parsed : (parsed.rankings ?? []);

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(s => ({ ...chunks[s.index], rerankScore: s.score / 10 }));
}

// ── Main ──

async function main() {
  console.log('Fetching candidate chunks for all queries...\n');

  // Pre-fetch candidates so both rerankers get identical input
  const candidateMap: Record<string, { text: string; pageNumber: number; score: number }[]> = {};
  for (const q of QUERIES) {
    candidateMap[q] = await getCandidates(q);
    console.log(`  "${q}" → ${candidateMap[q].length} candidates`);
  }

  // Warm-up delays between models to avoid influencing each other's latency
  await new Promise(r => setTimeout(r, 500));

  console.log('\n════════════════════════════════════════════════');
  console.log('                COHERE rerank-v3.5               ');
  console.log('════════════════════════════════════════════════\n');

  const cohereResults: Record<string, { ms: number; top3: string[] }> = {};
  for (const q of QUERIES) {
    const t0 = Date.now();
    const ranked = await rerankCohere(q, candidateMap[q]);
    const ms = Date.now() - t0;
    cohereResults[q] = {
      ms,
      top3: ranked.slice(0, 3).map(r => `[${r.rerankScore.toFixed(3)}] p${r.pageNumber}: ${r.text.substring(0, 90)}...`),
    };
    console.log(`=== "${q}" (${ms}ms) ===`);
    cohereResults[q].top3.forEach(l => console.log(' ', l));
    console.log();
  }

  await new Promise(r => setTimeout(r, 500));

  console.log('════════════════════════════════════════════════');
  console.log('              GPT-4o-mini scoring                ');
  console.log('════════════════════════════════════════════════\n');

  const gptResults: Record<string, { ms: number; top3: string[] }> = {};
  for (const q of QUERIES) {
    const t0 = Date.now();
    const ranked = await rerankGPT(q, candidateMap[q]);
    const ms = Date.now() - t0;
    gptResults[q] = {
      ms,
      top3: ranked.slice(0, 3).map(r => `[${r.rerankScore.toFixed(3)}] p${r.pageNumber}: ${r.text.substring(0, 90)}...`),
    };
    console.log(`=== "${q}" (${ms}ms) ===`);
    gptResults[q].top3.forEach(l => console.log(' ', l));
    console.log();
  }

  console.log('════════════════════════════════════════════════');
  console.log('                 SUMMARY TABLE                   ');
  console.log('════════════════════════════════════════════════\n');

  const pad = (s: string, n: number) => s.padEnd(n).substring(0, n);
  console.log(pad('Query', 42), pad('Cohere ms', 10), pad('GPT ms', 10), 'Faster');
  console.log('-'.repeat(70));
  for (const q of QUERIES) {
    const cMs = cohereResults[q].ms;
    const gMs = gptResults[q].ms;
    const faster = cMs < gMs ? `Cohere by ${gMs - cMs}ms` : `GPT by ${cMs - gMs}ms`;
    console.log(pad(q, 42), pad(`${cMs}ms`, 10), pad(`${gMs}ms`, 10), faster);
  }

  const totalCohere = QUERIES.reduce((s, q) => s + cohereResults[q].ms, 0);
  const totalGPT = QUERIES.reduce((s, q) => s + gptResults[q].ms, 0);
  console.log('-'.repeat(70));
  console.log(pad('TOTAL', 42), pad(`${totalCohere}ms`, 10), pad(`${totalGPT}ms`, 10));
  console.log(pad('AVERAGE', 42), pad(`${Math.round(totalCohere / QUERIES.length)}ms`, 10), `${Math.round(totalGPT / QUERIES.length)}ms`);

  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
