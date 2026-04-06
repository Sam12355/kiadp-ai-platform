import OpenAI from 'openai';
import { getEnv } from './env.js';

let openaiClient: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient;

  const env = getEnv();
  openaiClient = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  return openaiClient;
}
