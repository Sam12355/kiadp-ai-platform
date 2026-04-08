import { getPrisma } from '../config/database.js';
import { getOpenAI } from '../config/openai.js';
import { getPinecone } from '../config/pinecone.js';
import { getEnv } from '../config/env.js';
import { NotFoundError } from '../utils/errors.js';
 // Removed prisma explicit imports that were failing compilation

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

CONTENT RULES (Grounded Intelligence):
1. LITERAL PRIORITY: If a direct answer to the user's question exists within the CONTEXT DOCUMENTS, you MUST provide it as the primary response. Do not add outside interpretation if the document already provides a clear, direct answer.
2. SYNTHETIC ANALYSIS: Only when a single chunk does not provide a complete answer, or when the user asks for a 'new solution' or 'invention', should you 'Connect the Dots.' In these cases, weave information from across multiple chunks into a cohesive narrative.
3. GROUNDED REASONING: Your 'Intelligence' is only to be used as a bridge to connect context-provided facts. Use scientific principles from the documents to perform calculations or deduce solutions for new problems, ensuring every deduction is rooted in the provided context.
4. VISUALS: Describe context-provided images accurately.
5. NO OUTSIDE FACTS: You are still strictly forbidden from bringing in external facts, names, or data not found in the documents. Your intelligence applies to the *logic*, while your data remains locked to the *chunks*.
6. REFUSAL: Only if the context is entirely irrelevant to the query, trigger the [UNGROUNDED] protocol.
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

export async function askQuestion(
  userId: string, 
  queryText: string, 
  history: ChatMessage[] = [], 
  language: string = 'en', 
  mode: 'grounded' | 'general' = 'grounded'
): Promise<AnswerResponse> {
  const prisma = getPrisma();
  const openai = getOpenAI();
  const pinecone = getPinecone();
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

  const chitChatPatterns = /^(ok|okay|thanks|thank you|thx|cool|great|hello|hi|hey|good evening|good morning|good night|سلام|اهلا|مرحبا|صباح الخير|مساء الخير|شكرا|شكرًا|تمام|أوكي|اوكي|good|nice|awesome|perfect|yep|yes|no)$/i;
  const isChitChat = queryText.length < 30 && chitChatPatterns.test(queryText.trim().replace(/[?.!]/g, ''));

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

  // 6. Query Pinecone (Only if grounded AND not chit-chat)
  let chunks: any[] = [];
  let scoreMap = new Map<string, number>();

  if (mode === 'grounded' && !isChitChat) {
    const pineconeIndex = pinecone.Index(env.PINECONE_INDEX_NAME);
    const searchResults = await pineconeIndex.query({
      vector: queryVector,
      topK: 12,
      includeMetadata: true,
    });

    const textIds = searchResults.matches.filter(m => m.metadata?.type !== 'visual').map(m => m.id);
    const visualIds = searchResults.matches.filter(m => m.metadata?.type === 'visual').map(m => m.id);

    // Fetch Text Chunks
    const textChunks = await prisma.documentChunk.findMany({
      where: { pineconeVectorId: { in: textIds } },
      include: { document: { select: { title: true, originalFilename: true, storedFilename: true } } },
    });

    // Fetch Images for Visual Matches
    const visualImages = await prisma.documentImage.findMany({
      where: { pineconeVectorId: { in: visualIds } },
      include: { document: { select: { title: true, originalFilename: true, storedFilename: true } } },
    });

    scoreMap = new Map(searchResults.matches.map(m => [m.id, m.score ?? 0]));
    
    // Combine both for common processing
    chunks = textChunks;
    const visualHits = visualImages;

    // ── Proactive Page Mapping ──
    // Get all (docId, pageNum) pairs from retrieved text chunks
    const chunkPagePairs = textChunks.map(c => ({ documentId: c.documentId, pageNumber: c.pageNumber }));
    
    // Fetch any images that exist on the SAME pages as our text sources
    // This allows proactive display of visuals related to the text context!
    const contextImages = await prisma.documentImage.findMany({
      where: {
        OR: chunkPagePairs.map(p => ({
          documentId: p.documentId,
          pageNumber: p.pageNumber
        }))
      },
      include: { document: { select: { title: true, originalFilename: true, storedFilename: true } } },
    });

    // Merge visualHits (direct matches) and contextImages (page-based matches)
    const allImages = [...visualHits];
    contextImages.forEach(ci => {
      if (!allImages.find(ai => ai.id === ci.id)) {
        allImages.push(ci);
      }
    });

    (chunks as any).visualImages = allImages;

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
      instructions += `[Source ${idx + 1}] Filename: ${chunk.document.originalFilename} | Page: ${chunk.pageNumber}\n`;
      instructions += `${chunk.content}\n\n`;
    });
  }

  // Include history in the final answer generation too
  const historyMessages = history.map(h => ({ role: h.role, content: h.content } as const));

  const completion = await openai.chat.completions.create({
    model: selectedModel,
    messages: [
      { role: 'system', content: finalSystemPrompt },
      ...historyMessages,
      { role: 'user', content: instructions + "USER QUESTION: " + standaloneQuery },
    ],
    temperature: mode === 'grounded' ? 0 : 0.7, // 0 for exact grounding, 0.7 for general deep dives
  });

  let answerText = completion.choices[0].message.content || 'No response generated.';
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
      tokensUsed: completion.usage?.total_tokens ?? 0,
      sources: {
        create: mode === 'grounded' ? chunks.filter((c: any) => !c.isVisual).map((chunk: any, idx: number) => ({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          pageNumber: chunk.pageNumber,
          excerpt: chunk.content.substring(0, 200) + '...',
          relevanceScore: scoreMap.get(chunk.pineconeVectorId!) ?? 0,
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
