export const JOB_QUEUES = {
  INGEST_DOCUMENT: 'ingest-document',
  DELETE_DOCUMENT: 'delete-document',
} as const;

export interface IngestDocumentPayload {
  documentId: string;
  filePath: string;
}

export interface DeleteDocumentPayload {
  documentId: string;
  /** The stored upload to remove. Absent or a URL means there is no local file. */
  filePath?: string | null;
}
