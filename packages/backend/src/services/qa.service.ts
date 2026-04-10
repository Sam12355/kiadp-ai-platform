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
4. VISUALS: Describe context-provided images accurately with citations.
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
export async function searchKnowledge(queryText: string): Promise<{ results: { title: string; pageNumber: number; text: string; score: number }[] }> {
  const openai = getOpenAI();
  const env = getEnv();
  const prisma = getPrisma();

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

  return { results: reranked };
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

    chunks = rerankedTextChunks;

    // ── Parent-child retrieval ──
    // For each top-ranked chunk, fetch the immediately adjacent chunks (±1 by chunkIndex)
    // from the same document. These neighbors are injected into the LLM context so it has a
    // fuller picture, but they are NOT saved as sources or shown in the UI.
    if (rerankedTextChunks.length > 0) {
      const alreadyIncluded = new Set(rerankedTextChunks.map(c => c.id));
      const neighborChunks = await prisma.documentChunk.findMany({
        where: {
          AND: [
            { chunkIndex: { lt: 999 } },
            {
              OR: rerankedTextChunks.flatMap(c => [
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
    const VISUAL_KEYWORDS = /\b(chart|graph|table|figure|map|diagram|infograph|photograph|photo|image\s+show|depicts?|illustrat|plot|bar\s+chart|pie\s+chart|scatter|histogram|satellite|aerial|schematic|specimen|cultivation|disease|pest|logo|flag|coat\s+of\s+arms)\b/i;
    const VISUAL_BLOCKLIST = /\b(table of contents|bibliography|references|acknowledgment|copyright|title page)\b/i;
    let visualHits = visualImages.filter((img: any) => {
      const desc = img.description ?? '';
      return VISUAL_KEYWORDS.test(desc) && !VISUAL_BLOCKLIST.test(desc);
    });

    // Rerank images by description relevance — keep only the top 3 truly relevant ones
    if (visualHits.length > 3) {
      const imgForRerank = visualHits.map((img: any) => ({ ...img, text: img.description ?? '' }));
      const rerankedImgs = await rerankChunks(embeddingQuery, imgForRerank, 3);
      // Only keep images scored above 0.15 by the reranker
      visualHits = rerankedImgs.filter((img: any) => img.rerankScore > 0.15);
    }

    getLogger().debug({ visualBefore: visualImages.length, visualAfter: visualHits.length }, 'visual image filtering');
    (chunks as any).visualImages = visualHits;

    // Add visual descriptions to the context if they were direct hits or highly relevant
    visualHits.forEach((img: any) => {
      chunks.push({
        id: `vis_${img.id}`,
        content: `[Visual Evidence from Page ${img.pageNumber}]: ${img.description}`,
        pageNumber: img.pageNumber,
        documentId: img.documentId,
        document: img.document,
        isVisual: true
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

  if (mode === 'grounded' && !isChitChat && chunks.length > 0) {
    // ── 2-Step Extract-then-Answer (anti-hallucination) ──
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
