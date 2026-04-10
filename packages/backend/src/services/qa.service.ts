import { getPrisma } from '../config/database.js';
import { getOpenAI } from '../config/openai.js';
import { getEnv } from '../config/env.js';
import { NotFoundError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { CohereClient } from 'cohere-ai';

// ── Reranking utility ──
// Uses Cohere Rerank API when COHERE_API_KEY is set, falls back to GPT-4o-mini
async function rerankChunks<T extends { text: string }>(
  query: string,
  chunks: T[],
  topN: number = 6
): Promise<(T & { rerankScore: number })[]> {
  if (chunks.length === 0) return [];
  if (chunks.length <= topN) {
    return chunks.map(c => ({ ...c, rerankScore: 1 }));
  }

  const env = getEnv();

  // ── Path A: Cohere Rerank (fast, purpose-built, ~200ms) ──
  if (env.COHERE_API_KEY) {
    try {
      const cohere = new CohereClient({ token: env.COHERE_API_KEY });
      const response = await cohere.v2.rerank({
        model: 'rerank-v3.5',
        query,
        documents: chunks.map(c => c.text.substring(0, 800)),
        topN,
      });
      return response.results.map(r => ({
        ...chunks[r.index],
        rerankScore: r.relevanceScore,
      }));
    } catch (err) {
      getLogger().warn({ err }, 'Cohere rerank failed, falling back to GPT-4o-mini');
    }
  }

  // ── Path B: GPT-4o-mini fallback ──
  const openai = getOpenAI();
  const chunkList = chunks.map((c, i) =>
    `[${i}] ${c.text.substring(0, 300)}`
  ).join('\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL_MINI,
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

Include ALL passages in the rankings. Be strict — only passages with direct, useful information should score 7+.`
        },
        {
          role: 'user',
          content: `Query: "${query}"\n\nPassages:\n${chunkList}`
        }
      ],
      temperature: 0,
    });

    const content = response.choices[0].message.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return chunks.slice(0, topN).map(c => ({ ...c, rerankScore: 0.5 }));

    const parsed = JSON.parse(jsonMatch[0]);
    const scores: { index: number; score: number }[] =
      Array.isArray(parsed) ? parsed :
      (parsed.rankings || parsed.results || parsed.scores || []);

    if (!Array.isArray(scores) || scores.length === 0) {
      return chunks.slice(0, topN).map(c => ({ ...c, rerankScore: 0.5 }));
    }

    const scored = scores
      .filter(s => typeof s.index === 'number' && s.index >= 0 && s.index < chunks.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(s => ({ ...chunks[s.index], rerankScore: s.score / 10 }));

    return scored.length > 0 ? scored : chunks.slice(0, topN).map(c => ({ ...c, rerankScore: 0.5 }));
  } catch (err) {
    getLogger().error({ err }, 'GPT-4o-mini reranking failed, using original order');
    return chunks.slice(0, topN).map(c => ({ ...c, rerankScore: 0.5 }));
  }
}

export interface AnswerResponse {
  answerId: string;
  questionId: string;
  answerText: string;
  isGrounded: boolean;
  sources: {
    id: string;
    documentId: string;
    pageNumber: number;
    excerpt: string;
    relevanceScore: number;
    sourceDocument: { title: string; originalFilename: string; storedFilename: string };
  }[];
  images: {
    id: string;
    url: string;
    description: string;
    pageNumber: number;
  }[];
}

const SYSTEM_PROMPT = `
You are a prestige AI agricultural scientist representing the Khalifa International Award for Date Palm and Agricultural Innovation.

FORMATTING INSTRUCTIONS (CRITICAL):
1. **Bold** all technical terms, pest names, and chemical components.
2. Use ### Headers to separate different categories of information.
3. Use bullet points or numbered lists.
4. NO sources section is needed at the end of the text.
5. Use — for emphasis.

CITATION RULE (MANDATORY — THIS IS THE MOST IMPORTANT RULE):
Every factual statement you write MUST end with an inline citation like [Source 1] or [Source 3]. The number must match one of the CONTEXT DOCUMENTS provided.
- If a sentence contains a fact, a name, a number, a description, or any claim — it MUST have [Source N].
- Headers and transition phrases ("Here is...", "Let me explain...") do NOT need citations.
- If you cannot cite a fact from the provided sources, DO NOT write that fact at all.
- You may combine information from multiple sources in one sentence: [Source 1][Source 4].

CONTENT RULES (Grounded Intelligence):
1. LITERAL PRIORITY: If a direct answer exists in the CONTEXT DOCUMENTS, provide it as the primary response.
2. SYNTHETIC ANALYSIS: When no single chunk has a complete answer, weave information from multiple chunks — but every woven fact must still carry its [Source N] citation.
3. GROUNDED REASONING: You may use logic to connect facts across sources, but every factual input to that reasoning must be cited.
4. VISUALS: When [Visual Evidence from Page X] entries appear in your context, those images are AUTOMATICALLY DISPLAYED to the user in the chat interface as actual photos/figures. DO NOT say "I cannot provide a photo" or "I cannot show an image" — the image IS already being shown. Instead write "Here is an image showing..." or "As shown in the figure above..." and briefly describe what it depicts, with the relevant [Source N] citation.
5. ZERO OUTSIDE KNOWLEDGE: Do not add ANY facts, numbers, names, properties, or descriptions not present in the sources. If the sources don't mention it, you don't mention it.
6. REFUSAL: If the context is entirely irrelevant, trigger the [UNGROUNDED] protocol.
`;

const GENERAL_SYSTEM_PROMPT = `
You are a prestige AI agricultural scientist representing the Khalifa International Award for Date Palm and Agricultural Innovation.
You are now in 'Deep Dive' mode. While you still represent the Khalifa platform, you are encouraged to use your complete internal training data and general scientific knowledge to provide a comprehensive answer.

FORMATTING INSTRUCTIONS:
Same as standard (Bold terms, ### Headers, bullet points).
`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Lightweight vector search for voice mode — returns relevant document chunks without LLM processing
 */
export async function searchKnowledge(queryText: string, fast = false): Promise<{ results: { title: string; pageNumber: number; text: string; score: number }[]; images: { id: string; url: string; description: string; pageNumber: number }[] }> {
  const openai = getOpenAI();
  const env = getEnv();
  const prisma = getPrisma();

  // ── Fast path (voice mode): skip expansion + reranking, but keep keyword search ──
  if (fast) {
    // Query expansion: same as normal path — rewrite the noisy voice query into focused search terms
    const expansionPromise = openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL_MINI,
      messages: [
        { role: 'system', content: 'You are a search query optimizer. Given a user question (possibly from voice transcription), rewrite it as an optimal search query for a knowledge base about agriculture, date palms, and related topics. Return ONLY the rewritten query — no explanation. Keep it concise (under 20 words). Include key terms, synonyms, and likely domain-specific words.' },
        { role: 'user', content: queryText },
      ],
      temperature: 0,
    });
    const expansionResult = await expansionPromise;
    const expandedQueryFast = expansionResult.choices[0].message.content?.trim() || queryText;
    getLogger().debug({ original: queryText, expanded: expandedQueryFast }, 'fast path: query expanded');

    const stopWords = new Set(['the','and','for','are','but','not','you','all','can','her','was','one','our','out','has','had','how','its','may','who','did','get','let','say','she','too','use','what','when','where','which','why','with','this','that','from','they','been','have','will','each','make','like','just','over','such','take','than','them','very','some','into','most','other','about','after','would','these','could','their','there','should','between','before','tell','does','know']);
    const keywords = [...new Set(expandedQueryFast.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w)))];

    // Run embedding + keyword search in parallel (use expanded query for embedding too)
    const embeddingPromise = openai.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: expandedQueryFast,
    });

    const keywordPromise = keywords.length >= 1
      ? prisma.documentChunk.findMany({
          where: {
            AND: [
              { chunkIndex: { lt: 999 } },
              ...(keywords.length >= 2
                ? keywords.slice(0, 4).map(kw => ({ content: { contains: kw, mode: 'insensitive' as const } }))
                : [{ OR: keywords.map(kw => ({ content: { contains: kw, mode: 'insensitive' as const } })) }]),
            ],
          },
          include: { document: { select: { title: true } } },
          take: 15,
        })
      : Promise.resolve([]);

    const [embeddingResponse, keywordChunks] = await Promise.all([embeddingPromise, keywordPromise]);
    const queryVector = embeddingResponse.data[0].embedding;
    const vectorStr = `[${queryVector.join(',')}]`;
    type VectorRow = { id: string; document_id: string; content: string; page_number: number; similarity: number };
    const vectorRows = await prisma.$queryRawUnsafe<VectorRow[]>(`
      SELECT dc.id, dc.document_id, dc.content, dc.page_number,
             1 - (dc.embedding <=> '${vectorStr}'::vector) AS similarity
      FROM document_chunks dc
      WHERE dc.embedding IS NOT NULL AND dc.chunk_index < 999
      ORDER BY dc.embedding <=> '${vectorStr}'::vector
      LIMIT 60
    `);

    // Merge: dedup vector + keyword results
    const seenIds = new Set<string>();
    const docIds = [...new Set([...vectorRows.map((r: VectorRow) => r.document_id), ...keywordChunks.map(c => c.documentId)])];
    const docTitles = await prisma.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true, title: true },
    });
    const titleMap = new Map(docTitles.map(d => [d.id, d.title]));

    // Include documentId internally so image lookup can use exact (doc, page) pairs
    const vectorMapped = vectorRows.map((row: VectorRow) => ({ title: titleMap.get(row.document_id) ?? 'Unknown', pageNumber: row.page_number, text: row.content, score: row.similarity, documentId: row.document_id }));

    // Keyword results that are NOT in vector results
    const vectorIdSet = new Set(vectorRows.map((r: VectorRow) => r.id));
    const keywordOnly = keywordChunks
      .filter(c => !vectorIdSet.has(c.id))
      .map(chunk => {
        const matchCount = keywords.filter(kw => chunk.content.toLowerCase().includes(kw)).length;
        return { title: chunk.document.title, pageNumber: chunk.pageNumber, text: chunk.content, score: 0.3 + (matchCount / keywords.length) * 0.2, documentId: chunk.documentId };
      });

    const allMerged = [...vectorMapped, ...keywordOnly];

    // Rerank with Cohere (same as normal path) to surface truly relevant chunks
    const reranked = await rerankChunks(expandedQueryFast, allMerged, 10);
    const final = reranked.slice(0, 8);

    // ── Image selection: same logic as normal Q&A path ──
    const VISUAL_KEYWORDS_FAST = /\b(chart|graph|table|figure|map|diagram|infograph|photograph|photo|image\s+shows?|depicts?|illustrat|plot|bar\s+chart|pie\s+chart|scatter|histogram|satellite|aerial|schematic|specimen|cultivation|disease|pest|logo|flag|coat\s+of\s+arms|bowl|glass\s+bowl|paste)\b/i;
    const VISUAL_BLOCKLIST_FAST = /\b(table of contents|bibliography|references|acknowledgment|copyright|title page)\b/i;

    // 1) Visual-chunk embedding search (chunk_index >= 999, similarity > 0.32) — same as normal path
    const visualRowsFast = await prisma.$queryRawUnsafe<{ id: string; document_id: string; content: string; page_number: number; similarity: number }[]>(`
      SELECT dc.id, dc.document_id, dc.content, dc.page_number,
             1 - (dc.embedding <=> '${vectorStr}'::vector) AS similarity
      FROM document_chunks dc
      WHERE dc.embedding IS NOT NULL
        AND dc.chunk_index >= 999
        AND 1 - (dc.embedding <=> '${vectorStr}'::vector) > 0.32
      ORDER BY dc.embedding <=> '${vectorStr}'::vector
      LIMIT 5
    `);

    // 2) Fetch images for visual-chunk page matches
    const visualPagePairs = visualRowsFast.map(r => ({ documentId: r.document_id, pageNumber: r.page_number }));
    const visualChunkImages = visualPagePairs.length > 0
      ? await prisma.documentImage.findMany({
          where: { OR: visualPagePairs.map(p => ({ documentId: p.documentId, pageNumber: p.pageNumber })) },
          select: { id: true, filePath: true, description: true, pageNumber: true, documentId: true },
        })
      : [];

    // 3) Filter visual-chunk images with keywords + blocklist
    const filteredVisualChunkImages = visualChunkImages.filter(img => {
      const desc = img.description ?? '';
      return VISUAL_KEYWORDS_FAST.test(desc) && !VISUAL_BLOCKLIST_FAST.test(desc);
    });

    // 4) Secondary: fetch images on pages of top 5 TEXT results (same as normal path)
    const textPagePairs = final.slice(0, 5).map(r => ({ documentId: r.documentId, pageNumber: r.pageNumber }));
    const alreadyFoundKeys = new Set(filteredVisualChunkImages.map(img => `${img.documentId}:${img.pageNumber}`));
    const missingTextPairs = textPagePairs.filter(p => !alreadyFoundKeys.has(`${p.documentId}:${p.pageNumber}`));
    const textPageImages = missingTextPairs.length > 0
      ? await prisma.documentImage.findMany({
          where: { OR: missingTextPairs.map(p => ({ documentId: p.documentId, pageNumber: p.pageNumber })) },
          select: { id: true, filePath: true, description: true, pageNumber: true, documentId: true },
        })
      : [];
    const filteredTextPageImages = textPageImages.filter(img => {
      const desc = img.description ?? '';
      return VISUAL_KEYWORDS_FAST.test(desc) && !VISUAL_BLOCKLIST_FAST.test(desc);
    });

    // 5) Priority merge: text-page images first (relevance validated by text ranking), then visual-chunk images
    const allFastImages = [...filteredTextPageImages, ...filteredVisualChunkImages].slice(0, 3);

    return {
      results: final.map(({ documentId: _docId, rerankScore, ...r }) => ({ ...r, score: rerankScore })),
      images: allFastImages.map(img => ({
        id: img.id,
        url: img.filePath,
        description: img.description || '',
        pageNumber: img.pageNumber,
      })),
    };
  }

  // Query expansion: rewrite the raw voice query into a better search query
  const expansionResponse = await openai.chat.completions.create({
    model: env.OPENAI_CHAT_MODEL_MINI,
    messages: [
      {
        role: 'system',
        content: 'You are a search query optimizer. Given a user question (possibly from voice transcription), rewrite it as an optimal search query for a knowledge base about agriculture, date palms, and related topics. Return ONLY the rewritten query — no explanation. Keep it concise (under 20 words). Include key terms, synonyms, and likely domain-specific words.'
      },
      { role: 'user', content: queryText }
    ],
    temperature: 0,
  });
  const expandedQuery = expansionResponse.choices[0].message.content?.trim() || queryText;
  getLogger().debug({ original: queryText, expanded: expandedQuery }, 'searchKnowledge: query expanded');

  // Run vector search and keyword search in parallel
  const embeddingPromise = openai.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: expandedQuery,
  });

  // Extract significant words for keyword fallback
  const stopWords = new Set(['the','and','for','are','but','not','you','all','can','her','was','one','our','out','has','had','how','its','may','who','did','get','let','say','she','too','use','what','when','where','which','why','with','this','that','from','they','been','have','will','each','make','like','just','over','such','take','than','them','very','some','into','most','other','about','after','would','these','could','their','there','should','between','before']);
  // Use ORIGINAL query keywords for AND search (short, focused)
  const originalKeywords = [...new Set(queryText.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w)))];
  // Use BOTH original + expanded for OR search (broader net)
  const allWords = `${queryText} ${expandedQuery}`.toLowerCase().split(/\s+/);
  const allKeywords = [...new Set(allWords.filter(w => w.length >= 3 && !stopWords.has(w)))];

  // Keyword search: AND with original keywords (max 4), OR with all keywords
  let keywordPromise: Promise<any[]>;
  const andKeywords = originalKeywords.slice(0, 4);
  if (andKeywords.length >= 2) {
    keywordPromise = prisma.documentChunk.findMany({
      where: {
        AND: [
          { chunkIndex: { lt: 999 } },
          ...andKeywords.map(kw => ({ content: { contains: kw, mode: 'insensitive' as const } })),
        ],
      },
      include: { document: { select: { title: true } } },
      take: 25,
    }).then(async (andResults) => {
      if (andResults.length >= 5) return andResults;
      const orResults = await prisma.documentChunk.findMany({
        where: {
          AND: [
            { chunkIndex: { lt: 999 } },
            { OR: allKeywords.map(kw => ({ content: { contains: kw, mode: 'insensitive' as const } })) },
          ],
        },
        include: { document: { select: { title: true } } },
        take: 30,
      });
      const seenIds = new Set(andResults.map(r => r.id));
      return [...andResults, ...orResults.filter(r => !seenIds.has(r.id))].slice(0, 25);
    });
  } else if (allKeywords.length >= 1) {
    keywordPromise = prisma.documentChunk.findMany({
      where: {
        AND: [
          { chunkIndex: { lt: 999 } },
          { OR: allKeywords.slice(0, 6).map(kw => ({ content: { contains: kw, mode: 'insensitive' as const } })) },
        ],
      },
      include: { document: { select: { title: true } } },
      take: 25,
    });
  } else {
    keywordPromise = Promise.resolve([]);
  }

  const [embeddingResponse, keywordChunks] = await Promise.all([embeddingPromise, keywordPromise]);
  const queryVector = embeddingResponse.data[0].embedding;
  const vectorStr = `[${queryVector.join(',')}]`;

  // pgvector cosine similarity search — text chunks only (exclude visual evidence, chunk_index >= 999)
  type VectorRow = { id: string; document_id: string; content: string; page_number: number; similarity: number };
  const vectorRows = await prisma.$queryRawUnsafe<VectorRow[]>(`
    SELECT dc.id, dc.document_id, dc.content, dc.page_number,
           1 - (dc.embedding <=> '${vectorStr}'::vector) AS similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL
      AND dc.chunk_index < 999
    ORDER BY dc.embedding <=> '${vectorStr}'::vector
    LIMIT 60
  `);

  // Fetch document titles for pgvector results
  const docIds = [...new Set(vectorRows.map(r => r.document_id))];
  const docTitles = await prisma.document.findMany({
    where: { id: { in: docIds } },
    select: { id: true, title: true },
  });
  const titleMap = new Map(docTitles.map(d => [d.id, d.title]));

  // Merge vector results and keyword results, deduplicating by chunk ID
  const seenIds = new Set<string>();
  const results: { title: string; pageNumber: number; text: string; score: number }[] = [];

  for (const row of vectorRows) {
    seenIds.add(row.id);
    results.push({
      title: titleMap.get(row.document_id) ?? 'Unknown',
      pageNumber: row.page_number,
      text: row.content,
      score: row.similarity,
    });
  }

  // Add keyword matches that weren't in vector results (with a baseline score)
  for (const chunk of keywordChunks) {
    if (!seenIds.has(chunk.id)) {
      seenIds.add(chunk.id);
      const matchCount = allKeywords.filter(kw => chunk.content.toLowerCase().includes(kw)).length;
      results.push({
        title: chunk.document.title,
        pageNumber: chunk.pageNumber,
        text: chunk.content,
        score: 0.3 + (matchCount / allKeywords.length) * 0.2,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  getLogger().debug({ count: results.length }, 'searchKnowledge: pre-rerank candidates');

  // Rerank: use GPT-4o-mini to pick the most relevant chunks
  const reranked = await rerankChunks(queryText, results, 8);

  return { results: reranked, images: [] };
}

/**
 * Voice-optimised ask: fast search (2-3s) + quick GPT-mini answer synthesis (3-5s).
 * Returns the same shape as askQuestion but without DB persistence, chitchat detection,
 * query condensing, or parent-child retrieval — keeping latency under ~8s for Gemini Live.
 */
export async function voiceAsk(
  queryText: string,
  language: string = 'en'
): Promise<{ answerText: string; images: { id: string; url: string; description: string; pageNumber: number }[] }> {
  const openai = getOpenAI();
  const env = getEnv();
  const prisma = getPrisma();
  const t0 = Date.now();

  const langMap: Record<string, string> = { 'ar': 'Arabic', 'fr': 'French', 'en': 'English' };
  const targetLanguage = langMap[language] || 'English';

  // ── Step 1: Embed original query directly (skip expansion — saves ~4s) ──
  const embeddingResponse = await openai.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: queryText,
  });
  const queryVector = embeddingResponse.data[0].embedding;
  const vectorStr = `[${queryVector.join(',')}]`;
  getLogger().debug({ ms: Date.now() - t0 }, 'voiceAsk: embedding done');

  // ── Step 2: Vector + keyword + visual search in parallel ──
  const stopWords = new Set(['the','and','for','are','but','not','you','all','can','her','was','one','our','out','has','had','how','its','may','who','did','get','let','say','she','too','use','what','when','where','which','why','with','this','that','from','they','been','have','will','each','make','like','just','over','such','take','than','them','very','some','into','most','other','about','after','would','these','could','their','there','should','between','before','tell','does','know']);
  const keywords = [...new Set(queryText.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w)))];

  type VectorRow = { id: string; document_id: string; content: string; page_number: number; chunk_index: number; similarity: number };
  const vectorPromise = prisma.$queryRawUnsafe<VectorRow[]>(`
    SELECT dc.id, dc.document_id, dc.content, dc.page_number, dc.chunk_index,
           1 - (dc.embedding <=> '${vectorStr}'::vector) AS similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL AND dc.chunk_index < 999
    ORDER BY dc.embedding <=> '${vectorStr}'::vector
    LIMIT 25
  `);

  const keywordPromise = keywords.length >= 2
    ? prisma.documentChunk.findMany({
        where: { AND: [{ chunkIndex: { lt: 999 } }, ...keywords.slice(0, 3).map(kw => ({ content: { contains: kw, mode: 'insensitive' as const } }))] },
        select: { id: true, documentId: true, content: true, pageNumber: true, chunkIndex: true },
        take: 10,
      })
    : Promise.resolve([]);

  const visualPromise = prisma.$queryRawUnsafe<VectorRow[]>(`
    SELECT dc.id, dc.document_id, dc.content, dc.page_number, dc.chunk_index,
           1 - (dc.embedding <=> '${vectorStr}'::vector) AS similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL AND dc.chunk_index >= 999
      AND 1 - (dc.embedding <=> '${vectorStr}'::vector) > 0.32
    ORDER BY dc.embedding <=> '${vectorStr}'::vector
    LIMIT 5
  `);

  const [vectorRows, keywordChunks, visualRows] = await Promise.all([vectorPromise, keywordPromise, visualPromise]);
  getLogger().debug({ ms: Date.now() - t0, vectors: vectorRows.length, keywords: keywordChunks.length, visuals: visualRows.length }, 'voiceAsk: search done');

  // ── Step 3: Merge + dedupe then Cohere rerank (small set = fast) ──
  const seenIds = new Set<string>();
  interface MergedChunk { id: string; documentId: string; text: string; pageNumber: number; chunkIndex: number; score: number }
  const allMerged: MergedChunk[] = [];
  for (const row of vectorRows) {
    if (!seenIds.has(row.id)) { seenIds.add(row.id); allMerged.push({ id: row.id, documentId: row.document_id, text: row.content, pageNumber: row.page_number, chunkIndex: row.chunk_index, score: row.similarity }); }
  }
  for (const c of keywordChunks) {
    if (!seenIds.has(c.id)) { seenIds.add(c.id); allMerged.push({ id: c.id, documentId: c.documentId, text: c.content, pageNumber: c.pageNumber, chunkIndex: c.chunkIndex, score: 0.35 }); }
  }

  const reranked = await rerankChunks(queryText, allMerged, 8);
  getLogger().debug({ ms: Date.now() - t0, rerankedCount: reranked.length }, 'voiceAsk: rerank done');

  // Fetch doc metadata (same format as askQuestion)
  const docIds = [...new Set([...reranked.map(r => r.documentId), ...visualRows.map(r => r.document_id)])];
  const docList = await prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, title: true, originalFilename: true } });
  const docMap = new Map(docList.map(d => [d.id, d]));

  // ── Step 4: Parent-child neighbor chunks (same as askQuestion) ──
  const alreadyIncluded = new Set(reranked.map(c => c.id));
  const top5 = reranked.slice(0, 5);
  const neighborChunks = top5.length > 0 ? await prisma.documentChunk.findMany({
    where: {
      AND: [
        { chunkIndex: { lt: 999 } },
        { OR: top5.flatMap(c => [
            { documentId: c.documentId, chunkIndex: c.chunkIndex - 1 },
            { documentId: c.documentId, chunkIndex: c.chunkIndex + 1 },
          ]),
        },
      ],
    },
    select: { id: true, documentId: true, content: true, pageNumber: true, chunkIndex: true },
  }) : [];

  // ── Step 5: Image retrieval + answer generation in parallel ──
  const VISUAL_KW = /\b(chart|graph|table|figure|map|diagram|infograph|photograph|photo|image\s+shows?|depicts?|illustrat|plot|bar\s+chart|pie\s+chart|scatter|histogram|satellite|aerial|schematic|specimen|cultivation|disease|pest|logo|flag|coat\s+of\s+arms|bowl|glass\s+bowl|paste)\b/i;
  const VISUAL_BL = /\b(table of contents|bibliography|references|acknowledgment|copyright|title page)\b/i;

  const imagePromise = (async () => {
    const visualPagePairs = visualRows.map(r => ({ documentId: r.document_id, pageNumber: r.page_number }));
    const vcImages = visualPagePairs.length > 0
      ? await prisma.documentImage.findMany({ where: { OR: visualPagePairs.map(p => ({ documentId: p.documentId, pageNumber: p.pageNumber })) }, select: { id: true, filePath: true, description: true, pageNumber: true, documentId: true } })
      : [];
    const filteredVc = vcImages.filter(img => VISUAL_KW.test(img.description ?? '') && !VISUAL_BL.test(img.description ?? ''));

    const textPairs = reranked.slice(0, 5).map(r => ({ documentId: r.documentId, pageNumber: r.pageNumber }));
    const vcKeys = new Set(filteredVc.map(img => `${img.documentId}:${img.pageNumber}`));
    const missingPairs = textPairs.filter(p => !vcKeys.has(`${p.documentId}:${p.pageNumber}`));
    const textImgs = missingPairs.length > 0
      ? await prisma.documentImage.findMany({ where: { OR: missingPairs.map(p => ({ documentId: p.documentId, pageNumber: p.pageNumber })) }, select: { id: true, filePath: true, description: true, pageNumber: true, documentId: true } })
      : [];
    const filteredText = textImgs.filter(img => VISUAL_KW.test(img.description ?? '') && !VISUAL_BL.test(img.description ?? ''));

    // Priority: text-page images first (relevance proven by text reranking), then visual-chunk images
    return [...filteredText, ...filteredVc.filter(img => !filteredText.some(t => t.documentId === img.documentId && t.pageNumber === img.pageNumber))].slice(0, 3).map(img => ({
      id: img.id, url: img.filePath, description: img.description || '', pageNumber: img.pageNumber, documentId: img.documentId,
    }));
  })();

  // Resolve images first so we can include visual evidence in the LLM context
  const images = await imagePromise;

  // ── Build context in the SAME format as askQuestion ──
  let instructions = "CONTEXT DOCUMENTS (Including Visual Evidence descriptions):\n\n";
  let sourceIdx = 1;
  for (const chunk of reranked) {
    const doc = docMap.get(chunk.documentId);
    instructions += `[Source ${sourceIdx}] Filename: ${doc?.originalFilename ?? doc?.title ?? 'Unknown'} | Page: ${chunk.pageNumber}\n`;
    instructions += `${chunk.text}\n\n`;
    sourceIdx++;
  }
  // Add neighbor chunks as context
  for (const n of neighborChunks) {
    if (!alreadyIncluded.has(n.id)) {
      const doc = docMap.get(n.documentId);
      instructions += `[Context ${sourceIdx}] Filename: ${doc?.originalFilename ?? doc?.title ?? 'Unknown'} | Page: ${n.pageNumber}\n`;
      instructions += `${n.content}\n\n`;
      sourceIdx++;
    }
  }
  // Add visual evidence descriptions (same as askQuestion)
  for (const img of images) {
    instructions += `[Visual Evidence from Page ${img.pageNumber}]: ${img.description}\n\n`;
  }

  // Use the SAME system prompt as askQuestion (SYSTEM_PROMPT + language instruction)
  const finalSystemPrompt = SYSTEM_PROMPT + `\n\nRESPONSE LANGUAGE: You MUST respond entirely in ${targetLanguage}.`;

  const answerResp = await openai.chat.completions.create({
    model: env.OPENAI_CHAT_MODEL_MINI,
    messages: [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: instructions + "USER QUESTION: " + queryText },
    ],
    temperature: 0,
  });

  let answerText = answerResp.choices[0].message.content || '';
  // Clean citation markers (same as askQuestion)
  answerText = answerText.replace(/\[Source \d+\]/g, '').replace(/  +/g, ' ');
  getLogger().debug({ ms: Date.now() - t0, answerLength: answerText.length, imageCount: images.length }, 'voiceAsk: complete');

  return { answerText, images };
}

export async function askQuestion(
  userId: string, 
  queryText: string, 
  history: ChatMessage[] = [], 
  language: string = 'en', 
  mode: 'grounded' | 'general' = 'grounded'
): Promise<AnswerResponse> {
  const prisma = getPrisma();
  const openai = getOpenAI();
  const env = getEnv();

  const langMap: Record<string, string> = {
    'ar': 'Arabic',
    'fr': 'French',
    'en': 'English'
  };
  const targetLanguage = langMap[language] || 'English';
  const LANGUAGE_PROMPT = `\n\nRESPONSE LANGUAGE: You MUST respond entirely in ${targetLanguage}.`;


  // 1. Create Question Record
  const t0 = Date.now();
  const question = await prisma.question.create({
    data: { userId, queryText },
  });

  // 1.5 Smart Intent Classifier (Bypass RAG for small talk and social questions)
  let isChitChat = false;
  if (queryText.length < 120) {
    const classification = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL_MINI,
      messages: [
        { 
          role: 'system', 
          content: 'Classify the users intent. If it is a greeting, farewell, thanks, apology, social small-talk (like "how are you", "what is up", "how is your day"), or simple acknowledgment, respond with "CHIT_CHAT". If it is a real request for knowledge, data, or agricultural assistance, respond with "QUERY". Return ONLY the word.' 
        },
        { role: 'user', content: queryText },
      ],
      temperature: 0,
    });
    const result = classification.choices[0].message.content?.trim().toUpperCase();
    isChitChat = result === 'CHIT_CHAT' || result === '"CHIT_CHAT"';
  }
  getLogger().debug({ ms: Date.now() - t0 }, 'TIMING: chitchat classification');

  // 1.5 Determine Brain Power
  // Complex keywords in English and Arabic that trigger the "Heavy" brain
  const complexKeywords = /invent|design|synthesize|analyze|compare|calculate|solve|deep dive|connect|summary|summarize|creative|ابتكار|تصميم|تحليل|مقارنة|حساب|حل|تعمق|ربط|ملخص|تلخيص|إبداع/i;
  const isComplex = complexKeywords.test(queryText) || queryText.length > 300;
  const selectedModel = (isChitChat || !isComplex) ? env.OPENAI_CHAT_MODEL_MINI : env.OPENAI_CHAT_MODEL;

  let standaloneQuery = queryText;

  // 2. Query Condensing (Only if NOT chit-chat)
  if (history.length > 0 && !isChitChat) {
    const historyText = history.map(h => `${h.role.toUpperCase()}: ${h.content}`).join('\n');
    const condenseResponse = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL_MINI,
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful assistant. Given the chat history and the latest user question, rewrite the question into a standalone version that can be understood without the history. DO NOT ANSWER THE QUESTION. Only return the rewritten question.' 
        },
        { role: 'user', content: `HISTORY:\n${historyText}\n\nLATEST QUESTION: ${queryText}` },
      ],
      temperature: 0,
    });
    standaloneQuery = condenseResponse.choices[0].message.content || queryText;
  }

  // 3. Translate query (Only if NOT chit-chat)
  let embeddingQuery = standaloneQuery;
  if (language !== 'en' && !isChitChat) {
    const translationResponse = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL_MINI,
      messages: [
        {
          role: 'system',
          content: 'You are a translation assistant. Translate the user\'s question into English. Return ONLY the translated text, nothing else.',
        },
        { role: 'user', content: standaloneQuery },
      ],
      temperature: 0,
    });
    embeddingQuery = translationResponse.choices[0].message.content || standaloneQuery;
  }

  // 4. Generate embedding (Only if NOT chit-chat)
  let queryVector: number[] = [];
  if (!isChitChat) {
    const embeddingResponse = await openai.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: embeddingQuery,
    });
    queryVector = embeddingResponse.data[0].embedding;
  }
  getLogger().debug({ ms: Date.now() - t0 }, 'TIMING: after embedding');

  // 6. Query pgvector (Only if grounded AND not chit-chat)
  let chunks: any[] = [];

  if (mode === 'grounded' && !isChitChat) {
    const vectorStr = `[${queryVector.join(',')}]`;

    // pgvector cosine similarity — top 60 text chunks
    type VectorRow = { id: string; document_id: string; content: string; page_number: number; chunk_index: number; similarity: number };
    const vectorRows = await prisma.$queryRawUnsafe<VectorRow[]>(`
      SELECT dc.id, dc.document_id, dc.content, dc.page_number, dc.chunk_index,
             1 - (dc.embedding <=> '${vectorStr}'::vector) AS similarity
      FROM document_chunks dc
      WHERE dc.embedding IS NOT NULL
        AND dc.chunk_index < 999
      ORDER BY dc.embedding <=> '${vectorStr}'::vector
      LIMIT 60
    `);

    // ── Keyword search (AND + OR, same as searchKnowledge) ──
    const stopWords = new Set(['the','a','an','is','are','was','were','in','on','at','to','for','of','and','or','with','this','that','what','how','which','who','where','when','why','can','does','has','have','had','its','from','they','their','about']);
    const queryWords = embeddingQuery.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w));
    const andKeywords = queryWords.slice(0, 4);
    let keywordRows: any[] = [];
    if (andKeywords.length >= 2) {
      keywordRows = await prisma.documentChunk.findMany({
        where: {
          AND: [
            ...andKeywords.map((kw: string) => ({ content: { contains: kw, mode: 'insensitive' as const } })),
            { chunkIndex: { lt: 999 } },
          ]
        },
        select: { id: true, documentId: true, content: true, pageNumber: true, chunkIndex: true },
        take: 25,
      });
    } else if (queryWords.length >= 1) {
      keywordRows = await prisma.documentChunk.findMany({
        where: {
          AND: [
            { OR: queryWords.slice(0, 6).map((kw: string) => ({ content: { contains: kw, mode: 'insensitive' as const } })) },
            { chunkIndex: { lt: 999 } },
          ]
        },
        select: { id: true, documentId: true, content: true, pageNumber: true, chunkIndex: true },
        take: 25,
      });
    }

    // ── Merge vector + keyword results, dedup by id ──
    const seenIds = new Set(vectorRows.map(r => r.id));
    const mergedKeyword = keywordRows.filter((r: any) => !seenIds.has(r.id)).map((r: any) => ({
      id: r.id, document_id: r.documentId, content: r.content,
      page_number: r.pageNumber, chunk_index: r.chunkIndex, similarity: 0.3, // baseline score for keyword-only hits
    }));
    const allTextRows = [...vectorRows, ...mergedKeyword];

    // Also search for visual chunks via pgvector — only high-similarity matches
    const visualRows = await prisma.$queryRawUnsafe<VectorRow[]>(`
      SELECT dc.id, dc.document_id, dc.content, dc.page_number, dc.chunk_index,
             1 - (dc.embedding <=> '${vectorStr}'::vector) AS similarity
      FROM document_chunks dc
      WHERE dc.embedding IS NOT NULL
        AND dc.chunk_index >= 999
        AND 1 - (dc.embedding <=> '${vectorStr}'::vector) > 0.32
      ORDER BY dc.embedding <=> '${vectorStr}'::vector
      LIMIT 5
    `);

    const allDocIds = [...new Set([...allTextRows, ...visualRows].map(r => r.document_id))];
    const docList = await prisma.document.findMany({
      where: { id: { in: allDocIds } },
      select: { id: true, title: true, originalFilename: true, storedFilename: true },
    });
    const docMap = new Map(docList.map(d => [d.id, d]));

    const textChunks = allTextRows.map(r => ({
      id: r.id,
      documentId: r.document_id,
      content: r.content,
      pageNumber: r.page_number,
      chunkIndex: r.chunk_index,
      similarity: r.similarity,
      document: docMap.get(r.document_id) ?? { title: 'Unknown', originalFilename: '', storedFilename: '' },
    }));

    // Fetch Images for visual chunk matches
    const visualPageNums = visualRows.map(r => ({ documentId: r.document_id, pageNumber: r.page_number }));
    const visualImages = visualPageNums.length > 0
      ? await prisma.documentImage.findMany({
          where: { OR: visualPageNums.map(p => ({ documentId: p.documentId, pageNumber: p.pageNumber })) },
          include: { document: { select: { title: true, originalFilename: true, storedFilename: true } } },
        })
      : [];

    // Rerank text chunks for better relevance
    const textChunksForRerank = textChunks.map(c => ({ ...c, text: c.content }));
    const rerankedTextChunks = await rerankChunks(embeddingQuery, textChunksForRerank, 10);
    getLogger().debug({ ms: Date.now() - t0 }, 'TIMING: after reranking');

    chunks = rerankedTextChunks;

    // ── Parent-child retrieval ──
    // For the top 5 ranked chunks, fetch immediately adjacent chunks (±1 by chunkIndex).
    // These neighbors provide fuller context but are NOT saved as sources.
    if (rerankedTextChunks.length > 0) {
      const alreadyIncluded = new Set(rerankedTextChunks.map(c => c.id));
      const top5 = rerankedTextChunks.slice(0, 5);
      const neighborChunks = await prisma.documentChunk.findMany({
        where: {
          AND: [
            { chunkIndex: { lt: 999 } },
            {
              OR: top5.flatMap(c => [
                { documentId: c.documentId, chunkIndex: c.chunkIndex - 1 },
                { documentId: c.documentId, chunkIndex: c.chunkIndex + 1 },
              ]),
            },
          ],
        },
        select: {
          id: true,
          documentId: true,
          content: true,
          pageNumber: true,
          chunkIndex: true,
          document: { select: { title: true, originalFilename: true, storedFilename: true } },
        },
      });
      for (const n of neighborChunks) {
        if (!alreadyIncluded.has(n.id)) {
          (chunks as any[]).push({ ...n, similarity: 0, rerankScore: 0, isNeighbor: true });
          alreadyIncluded.add(n.id);
        }
      }
      getLogger().debug({ neighbors: neighborChunks.length }, 'parent-child: neighbor chunks added');
    }

    // Only show images that are truly visual (charts, tables, maps, figures, photos etc.)
    // — not plain text pages that happen to have an image record.
    const VISUAL_KEYWORDS = /\b(chart|graph|table|figure|map|diagram|infograph|photograph|photo|image\s+shows?|depicts?|illustrat|plot|bar\s+chart|pie\s+chart|scatter|histogram|satellite|aerial|schematic|specimen|cultivation|disease|pest|logo|flag|coat\s+of\s+arms|bowl|glass\s+bowl|paste)\b/i;
    const VISUAL_BLOCKLIST = /\b(table of contents|bibliography|references|acknowledgment|copyright|title page)\b/i;
    let visualHits = visualImages.filter((img: any) => {
      const desc = img.description ?? '';
      return VISUAL_KEYWORDS.test(desc) && !VISUAL_BLOCKLIST.test(desc);
    });

    getLogger().debug({ visualBefore: visualImages.length, visualAfter: visualHits.length }, 'visual image filtering');
    const initialVisualHits = [...visualHits]; // snapshot before merging text-page images

    // ── Secondary: also find images on pages of top-ranked TEXT chunks ──
    // Visual-chunk embedding search fails when image descriptions are purely visual
    // (e.g. "brown paste in a bowl") while the user asks about a topic ("tagellah dish").
    // The text chunks DO rank high for the topic, so fetch images on those pages too.
    const textChunkPagePairs = rerankedTextChunks.slice(0, 5).map((c: any) => ({
      documentId: c.documentId, pageNumber: c.pageNumber,
    }));
    const alreadyFoundPageKeys = new Set(visualHits.map((img: any) => `${img.documentId}:${img.pageNumber}`));
    const missingPairs = textChunkPagePairs.filter(
      (p: any) => !alreadyFoundPageKeys.has(`${p.documentId}:${p.pageNumber}`)
    );
    if (missingPairs.length > 0) {
      const textPageImages = await prisma.documentImage.findMany({
        where: { OR: missingPairs.map((p: any) => ({ documentId: p.documentId, pageNumber: p.pageNumber })) },
        include: { document: { select: { title: true, originalFilename: true, storedFilename: true } } },
      });
      const extraVisual = textPageImages.filter((img: any) => {
        const desc = img.description ?? '';
        return VISUAL_KEYWORDS.test(desc) && !VISUAL_BLOCKLIST.test(desc);
      });
      if (extraVisual.length > 0) {
        getLogger().debug({ extraVisualFromTextPages: extraVisual.length }, 'found images on text-chunk pages');
        visualHits.push(...extraVisual);
      }
    }

    // Cap to 3 images, prioritizing text-page images (relevance already validated by text chunk reranking)
    // then fill remaining slots with visual-chunk-based images
    const initialIds = new Set(initialVisualHits.map((img: any) => img.id));
    const textPageImgs = visualHits.filter((img: any) => !initialIds.has(img.id));
    const visualChunkImgs = visualHits.filter((img: any) => initialIds.has(img.id));
    visualHits = [...textPageImgs, ...visualChunkImgs].slice(0, 3);

    (chunks as any).visualImages = visualHits;

    // Add visual descriptions to the LLM context so it knows images are being shown
    visualHits.forEach((img: any) => {
      chunks.push({
        id: `vis_${img.id}`,
        content: `[Visual Evidence from Page ${img.pageNumber}]: ${img.description}`,
        pageNumber: img.pageNumber,
        documentId: img.documentId,
        document: img.document,
        isVisual: true,
      });
    });
  }

  // 6. Handle grounded mode with no results (EXCEPT for chit-chat)
  if (mode === 'grounded' && chunks.length === 0 && !isChitChat) {
    const noInfoMap: Record<string, string> = {
      'en': "I couldn't find any relevant documents or visual evidence in the Khalifa repository to address your specific query.",
      'fr': "Je n'ai trouvé aucun document ou preuve visuelle pertinente dans le répertoire Khalifa pour répondre à votre demande spécifique.",
      'ar': "لم أتمكن من العثور على أي وثائق أو أدلة مرئية ذات صلة في مستودع خليفة للإجابة على استفسارك المحدد."
    };
    return createEmptyAnswer(question.id, noInfoMap[language] || noInfoMap['en']);
  }

  // 7. Construct Final Prompt
  let finalSystemPrompt = (mode === 'grounded' ? SYSTEM_PROMPT : GENERAL_SYSTEM_PROMPT) + LANGUAGE_PROMPT;
  
  if (isChitChat) {
    finalSystemPrompt = `You are a polite assistant representing the Khalifa platform. The user is just being polite (greetings or thanks). Respond briefly and politely. DO NOT talk about technical limitations or deep dive modes. Just say "You're welcome" or "Hello, how can I help today?" or similar.` + LANGUAGE_PROMPT;
  }
  
  let instructions = "";
  if (mode === 'grounded') {
    instructions = "CONTEXT DOCUMENTS (Including Visual Evidence descriptions):\n\n";
    chunks.forEach((chunk: any, idx: number) => {
      instructions += `[${chunk.isNeighbor ? 'Context' : 'Source'} ${idx + 1}] Filename: ${chunk.document.originalFilename} | Page: ${chunk.pageNumber}\n`;
      instructions += `${chunk.content}\n\n`;
    });
  }

  // Include history in the final answer generation too
  const historyMessages = history.map(h => ({ role: h.role, content: h.content } as const));

  let answerText: string;
  let totalTokens = 0;

  if (mode === 'grounded' && !isChitChat && chunks.length > 0 && isComplex) {
    // ── 2-Step Extract-then-Answer (anti-hallucination) for COMPLEX queries ──
    // Step 1: Extract relevant passages from the sources (cheap model, fast)
    const extractResp = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL_MINI,
      messages: [
        {
          role: 'system',
          content: `You are a text extractor. Given SOURCE DOCUMENTS and a QUESTION, extract all passages from the sources that could help answer the question — even if they answer it only partially or indirectly.

Rules:
- Copy relevant passages as they appear in the sources. Keep the original wording.
- Prefix each extract with its source label, e.g. [Source 3]: "passage here"
- Be GENEROUS — include passages that are even tangentially related. It is much better to include too much than too little.
- If the question asks about a topic made from/related to another topic, include information about BOTH the specific item AND its ingredients or related concepts.
- If the question refers to something from conversation history, find passages related to that topic.
- You MUST always extract at least something — even loosely related passages. Never refuse to extract.
- Do NOT add any facts, numbers, or descriptions from your own knowledge — only extract from sources.`
        },
        ...historyMessages,
        { role: 'user', content: instructions + "QUESTION: " + standaloneQuery }
      ],
      temperature: 0,
    });
    totalTokens += extractResp.usage?.total_tokens ?? 0;
    const extractedQuotes = extractResp.choices[0].message.content || '';
    getLogger().info({ standaloneQuery, extractLength: extractedQuotes.length, extractPreview: extractedQuotes.substring(0, 300) }, 'extract-then-answer: step 1 result');
    getLogger().debug({ ms: Date.now() - t0 }, 'TIMING: after extract step');

    // Step 2: Answer using ONLY the extracted quotes (main model, no access to training data as "confirmation")
    const answerResp = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...historyMessages,
        {
          role: 'user',
          content: `VERIFIED EXTRACTS FROM DOCUMENTS (these are the ONLY facts you may use):\n\n${extractedQuotes}\n\nUSER QUESTION: ${standaloneQuery}`
        }
      ],
      temperature: 0,
    });
    totalTokens += answerResp.usage?.total_tokens ?? 0;
    answerText = answerResp.choices[0].message.content || 'No response generated.';
    getLogger().debug({ ms: Date.now() - t0 }, 'TIMING: after answer step (2-step)');
  } else if (mode === 'grounded' && !isChitChat && chunks.length > 0) {
    // ── Direct single-step answer for SIMPLE queries (skip extract for speed) ──
    // The system prompt already enforces "only use provided context" for anti-hallucination.
    // Cohere reranking ensures the top chunks are highly relevant.
    const answerResp = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...historyMessages,
        { role: 'user', content: instructions + "USER QUESTION: " + standaloneQuery }
      ],
      temperature: 0,
    });
    totalTokens += answerResp.usage?.total_tokens ?? 0;
    answerText = answerResp.choices[0].message.content || 'No response generated.';
    getLogger().debug({ ms: Date.now() - t0 }, 'TIMING: after direct answer step (extract skipped)');
  } else {
    // Non-grounded / chit-chat / general mode — single pass
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...historyMessages,
        { role: 'user', content: instructions + "USER QUESTION: " + standaloneQuery },
      ],
      temperature: mode === 'grounded' ? 0 : 0.7,
    });
    totalTokens += completion.usage?.total_tokens ?? 0;
    answerText = completion.choices[0].message.content || 'No response generated.';
  }

  // Clean any leftover citation markers from the answer
  answerText = answerText.replace(/\[Source \d+\]/g, '').replace(/  +/g, ' ');
  let isGrounded = mode === 'grounded';

  if (mode === 'grounded' && answerText.includes("[UNGROUNDED]")) {
    isGrounded = false;
    answerText = answerText.replace("[UNGROUNDED]", "").trim();
    
    // Safety Net: If AI only sent [UNGROUNDED] or failed to provide a refusal
    if (!answerText) {
      const fallbackMap: Record<string, string> = {
        'en': "I'm sorry, but this information or visual evidence is not available in the Khalifa Knowledge Base. For a general scientific explanation, please try the **Deep Dive** ✦ mode below.",
        'fr': "Je suis désolé, mais cette information ou preuve visuelle n'est pas disponible dans la base de connaissances Khalifa. Pour une explication scientifique générale, veuillez essayer le mode **Deep Dive** ✦ ci-dessous.",
        'ar': "عذرًا، هذه المعلومات أو الأدلة المرئية غير متوفرة في قاعدة معرفة خليفة. للحصول على شرح علمي عام، يرجى تجربة وضع **Deep Dive** ✦ أدناه."
      };
      answerText = fallbackMap[language] || fallbackMap['en'];
    }
  }

  // 7. Save Answer & Sources
  const answer = await prisma.answer.create({
    data: {
      questionId: question.id,
      answerText,
      isGrounded,
      modelUsed: env.OPENAI_CHAT_MODEL,
      tokensUsed: totalTokens,
      sources: {
        create: mode === 'grounded' ? chunks.filter((c: any) => !c.isVisual && !c.isNeighbor).map((chunk: any, idx: number) => ({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          pageNumber: chunk.pageNumber,
          excerpt: chunk.content.substring(0, 200) + '...',
          relevanceScore: chunk.similarity ?? chunk.rerankScore ?? 0,
          rank: idx + 1,
        })) : [],
      },
      answerImages: {
        create: mode === 'grounded' && (chunks as any).visualImages ? (chunks as any).visualImages.map((img: any) => ({
          imageId: img.id
        })) : []
      }
    },
    include: {
      sources: {
        include: { chunk: { include: { document: { select: { title: true, originalFilename: true, storedFilename: true } } } } },
      },
      answerImages: {
        include: { image: true }
      }
    },
  });

  return formatAnswerResponse(answer);
}

// ── Helpers ──

async function createEmptyAnswer(questionId: string, text: string): Promise<AnswerResponse> {
  const prisma = getPrisma();
  const answer = await prisma.answer.create({
    data: { questionId, answerText: text, isGrounded: false },
    include: { sources: { include: { chunk: { include: { document: { select: { title: true, originalFilename: true, storedFilename: true } } } } } } },
  });
  return formatAnswerResponse(answer);
}

function formatAnswerResponse(answer: any): AnswerResponse {
  return {
    answerId: answer.id,
    questionId: answer.questionId,
    answerText: answer.answerText,
    isGrounded: answer.isGrounded,
    sources: answer.sources.map((s: any) => ({
      id: s.id,
      documentId: s.documentId,
      pageNumber: s.pageNumber,
      excerpt: s.excerpt,
      relevanceScore: s.relevanceScore,
      sourceDocument: { 
        title: s.chunk.document.title,
        originalFilename: s.chunk.document.originalFilename,
        storedFilename: s.chunk.document.storedFilename 
      },
    })),
    images: answer.answerImages?.map((ai: any) => ({
      id: ai.image.id,
      url: ai.image.filePath,
      description: ai.image.description,
      pageNumber: ai.image.pageNumber
    })) || []
  };
}
