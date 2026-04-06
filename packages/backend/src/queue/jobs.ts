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
  pineconeVectorIds: string[];
}
