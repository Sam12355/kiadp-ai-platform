/**
 * Vision service — Gemini Flash (free tier) with GPT-4o fallback.
 *
 * Uses Gemini 2.0 Flash for image description during ingestion.
 * Falls back to GPT-4o when Gemini returns 429 (rate limit) or is unavailable.
 */
import { GoogleGenAI } from '@google/genai';
import { getEnv } from '../config/env.js';
import { getOpenAI } from '../config/openai.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

let gemini: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI | null {
  if (gemini) return gemini;
  const key = getEnv().GEMINI_API_KEY;
  if (!key) return null;
  gemini = new GoogleGenAI({ apiKey: key });
  return gemini;
}

/** Whether we've exhausted the Gemini free tier this run (sticky until process restarts). */
let geminiExhausted = false;

/**
 * Describe an image using Gemini Flash, falling back to GPT-4o on failure.
 * @param base64Image  JPEG image as base64 string
 * @param prompt       Text prompt for the vision model
 * @returns  The description text, or null if both models fail
 */
export async function describeImage(
  base64Image: string,
  prompt: string,
): Promise<string | null> {
  // ── Try Gemini Flash first ──
  if (!geminiExhausted) {
    const ai = getGemini();
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
              ],
            },
          ],
          config: {
            maxOutputTokens: 600,
          },
        });

        const text = response.text?.trim();
        if (text && text.length > 20) {
          return text;
        }
        // Empty / too-short response — fall through to GPT
        logger.warn('Gemini returned empty/short response, falling back to GPT-4o');
      } catch (err: any) {
        const status = err?.status ?? err?.httpStatusCode ?? err?.code;
        if (status === 429 || status === 'RESOURCE_EXHAUSTED') {
          logger.warn('Gemini free tier exhausted — switching to GPT-4o for remaining images');
          geminiExhausted = true;
        } else {
          logger.warn(`Gemini vision error (${status}): ${err.message ?? err} — falling back to GPT-4o`);
        }
      }
    }
  }

  // ── Fallback: GPT-4o ──
  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
        ],
      }],
      max_tokens: 600,
    });
    return response.choices[0].message.content?.trim() ?? null;
  } catch (err: any) {
    logger.error(`GPT-4o vision fallback also failed: ${err.message ?? err}`);
    return null;
  }
}
