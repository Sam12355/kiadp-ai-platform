import { Pinecone } from '@pinecone-database/pinecone';
import { getEnv } from './env.js';

let pineconeClient: Pinecone | null = null;

export function getPinecone(): Pinecone {
  if (pineconeClient) return pineconeClient;

  const env = getEnv();
  pineconeClient = new Pinecone({
    apiKey: env.PINECONE_API_KEY,
  });

  return pineconeClient;
}

export function getPineconeIndex() {
  const env = getEnv();
  return getPinecone().index(env.PINECONE_INDEX_NAME);
}
