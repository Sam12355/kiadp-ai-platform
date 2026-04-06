// ================================================
// Document Types
// ================================================

export enum DocumentStatus {
  UPLOADED = 'UPLOADED',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ARCHIVED = 'ARCHIVED',
}

export enum IngestionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum IngestionStep {
  EXTRACTING = 'EXTRACTING',
  OCR = 'OCR',
  CHUNKING = 'CHUNKING',
  EMBEDDING = 'EMBEDDING',
  INDEXING = 'INDEXING',
}

export interface DocumentSummary {
  id: string;
  title: string;
  originalFilename: string;
  storedFilename: string;
  fileSizeBytes: number;
  pageCount: number | null;
  chunkCount: number | null;
  status: DocumentStatus;
  progress: number;
  categories: string[];
  metadata: Record<string, unknown> | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  mimeType: string;
  storedFilename: string;
  filePath: string;
  metadata: Record<string, unknown> | null;
  pages: DocumentPageInfo[];
  ingestionJobs: IngestionJobSummary[];
}

export interface DocumentPageInfo {
  id: string;
  pageNumber: number;
  wordCount: number;
  isOcr: boolean;
}

export interface DocumentChunkInfo {
  id: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber: number;
  sectionHeading: string | null;
  language: string | null;
}

export interface DocumentImageInfo {
  id: string;
  pageNumber: number;
  filePath: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
}

export interface IngestionJobSummary {
  id: string;
  documentId: string;
  status: IngestionStatus;
  step: IngestionStep | null;
  progressPct: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface IngestionJobDetail extends IngestionJobSummary {
  logEntries: LogEntry[];
  document: DocumentSummary;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface UploadDocumentRequest {
  title?: string;
  categories?: string[];
}

export interface DocumentListQuery {
  page?: number;
  limit?: number;
  status?: DocumentStatus;
  category?: string;
  search?: string;
  sortBy?: 'createdAt' | 'title' | 'status';
  sortOrder?: 'asc' | 'desc';
}
