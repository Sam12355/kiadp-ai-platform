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
1. **Bold** all technical terms, pest names (e.g., **Red Palm Weevil**), and chemical components.
2. Use ### Headers to separate different categories of information.
3. Use bullet points or numbered lists.
4. NO sources section is needed at the end of the text.
5. Use — for emphasis.

CONTENT RULES (ABSOLUTE GROUNDING - NO EXCEPTIONS):
1. MANDATORY: Every single word of your answer must be derived ONLY from the CONTEXT DOCUMENTS provided below.
2. VISUALS: You can see and describe images/figures mentioned in the context. Do NOT apologize or say you cannot show images; simply describe them, and the system will automatically display the relevant image files in the gallery.
3. STRICT PROHIBITION: You are forbidden from using your internal training, general knowledge, or common sense to supplement, explain, or interpret information.
4. If the answer to the user's question is not explicitly stated in the provided documents, you MUST trigger the [UNGROUNDED] protocol immediately. 
5. Do NOT attempt to be helpful by providing external context or definitions. Your ONLY goal is to accurately represent the provided data.
6. This rule applies to ALL questions, descriptions, definitions, and summaries.
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

  let standaloneQuery = queryText;

  // 2. Query Condensing (if history exists)
  // If there is history, we ask OpenAI to rewrite the question into a solo query that doesn't need context
  if (history.length > 0) {
    const historyText = history.map(h => `${h.role.toUpperCase()}: ${h.content}`).join('\n');
    const condenseResponse = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
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

  // 3. Translate query to English for embedding (documents are stored in English)
  let embeddingQuery = standaloneQuery;
  if (language !== 'en') {
    const translationResponse = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
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

  // 4. Generate embedding for query using English text
  const embeddingResponse = await openai.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: embeddingQuery,
  });
  const queryVector = embeddingResponse.data[0].embedding;

  // 5. Query Pinecone (Only if grounded)
  let chunks: any[] = [];
  let scoreMap = new Map<string, number>();

  if (mode === 'grounded') {
    const pineconeIndex = pinecone.Index(env.PINECONE_INDEX_NAME);
    const searchResults = await pineconeIndex.query({
      vector: queryVector,
      topK: 6,
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
    (chunks as any).visualImages = visualImages;

    // Add visual descriptions to the context if any
    visualImages.forEach((img: any) => {
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

  // 6. Handle grounded mode with no results (Now checks both text and visual)
  if (mode === 'grounded' && chunks.length === 0) {
    const noInfoMap: Record<string, string> = {
      'en': "I couldn't find any relevant documents or visual evidence in the Khalifa repository to address your specific query.",
      'fr': "Je n'ai trouvé aucun document ou preuve visuelle pertinente dans le répertoire Khalifa pour répondre à votre demande spécifique.",
      'ar': "لم أتمكن من العثور على أي وثائق أو أدلة مرئية ذات صلة في مستودع خليفة للإجابة على استفسارك المحدد."
    };
    return createEmptyAnswer(question.id, noInfoMap[language] || noInfoMap['en']);
  }

  // 7. Construct Final Prompt
  const finalSystemPrompt = (mode === 'grounded' ? SYSTEM_PROMPT : GENERAL_SYSTEM_PROMPT) + LANGUAGE_PROMPT;
  
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
    model: env.OPENAI_CHAT_MODEL,
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
