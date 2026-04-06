// ================================================
// Question & Answer Types
// ================================================

export interface AskQuestionRequest {
  query: string;
}

export interface QuestionSummary {
  id: string;
  queryText: string;
  createdAt: string;
  hasAnswer: boolean;
}

export interface AnswerResponse {
  id: string;
  questionId: string;
  queryText: string;
  answerText: string;
  confidenceScore: number | null;
  isGrounded: boolean;
  groundingNote: string | null;
  modelUsed: string | null;
  tokensUsed: number | null;
  sources: AnswerSourceInfo[];
  relatedImages: AnswerImageInfo[];
  createdAt: string;
}

export interface AnswerSourceInfo {
  id: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  excerpt: string;
  relevanceScore: number;
  rank: number;
}

export interface AnswerImageInfo {
  id: string;
  imageId: string;
  filePath: string;
  pageNumber: number;
  altText: string | null;
}

/** Structured response expected from the LLM */
export interface LLMStructuredResponse {
  answer: string;
  sources: Array<{
    document_title: string;
    page_number: number;
    excerpt: string;
    relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  grounding_note: string;
  limitations: string;
  is_grounded: boolean;
}

export interface QuestionHistoryQuery {
  page?: number;
  limit?: number;
}
