import { Router, Request, Response } from 'express';
import { getEnv } from '../config/env.js';
import { getPrisma } from '../config/database.js';
import { askQuestion } from '../services/qa.service.js';
import { getLogger } from '../utils/logger.js';
import { getOpenAI } from '../config/openai.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const WHATSAPP_API_TIMEOUT_MS = 15000;

/**
 * Convert markdown-style AI response to WhatsApp-compatible formatting.
 * WhatsApp supports: *bold*, _italic_, ~strikethrough~, `mono`, ```code block```, > quote, bullet lists.
 * No colors or font sizes are supported in WhatsApp.
 */
function formatForWhatsApp(text: string): string {
  return text
    // H1/H2/H3 headings → bold on its own line
    .replace(/^#{1,3} (.+)$/gm, '*$1*')
    // **bold** → *bold*
    .replace(/\*\*(.+?)\*\*/gs, '*$1*')
    // __underline__ → *bold* (WhatsApp has no underline)
    .replace(/__(.+?)__/gs, '*$1*')
    // Markdown bullet lists (- or *) → WhatsApp bullet (•)
    .replace(/^[ \t]*[-*] (.+)$/gm, '• $1')
    // Horizontal rules → simple divider
    .replace(/^[-*_]{3,}$/gm, '───────────────')
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Mark an incoming message as read — shows blue double-ticks to the sender
 * immediately, giving visual confirmation the bot received their message.
 */
async function markAsRead(messageId: string, phoneNumberId: string, accessToken: string): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(WHATSAPP_API_TIMEOUT_MS),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch {
    // Non-critical — ignore failures
  }
}

/**
 * Show a typing indicator tied to an incoming message.
 * Falls back to the existing ack flow if Meta rejects the payload.
 */
async function sendTypingIndicator(messageId: string, phoneNumberId: string, accessToken: string): Promise<boolean> {
  const log = getLogger();
  try {
    const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(WHATSAPP_API_TIMEOUT_MS),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
    });
    const responseBody = await res.text();
    if (!res.ok) {
      log.warn({ status: res.status, body: responseBody, messageId }, 'WhatsApp typing indicator failed');
      return false;
    }

    log.debug({ messageId, responseBody }, 'WhatsApp typing indicator sent');
    return true;
  } catch (err) {
    log.warn({ err, messageId }, 'WhatsApp typing indicator error');
    return false;
  }
}

/**
 * Delete a WhatsApp message previously sent by the business (e.g. an ack message).
 */
/**
 * Edit a previously sent WhatsApp message in-place.
 * Uses editing_of_message_id — the original message updates for both parties.
 */
async function editWhatsAppMessage(messageId: string, to: string, newText: string, phoneNumberId: string, accessToken: string): Promise<void> {
  const log = getLogger();
  try {
    const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(WHATSAPP_API_TIMEOUT_MS),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: newText, preview_url: false },
        editing_of_message_id: messageId,
      }),
    });
    const responseBody = await res.text();
    if (!res.ok) {
      log.warn({ status: res.status, body: responseBody, messageId }, 'WhatsApp edit message failed');
    } else {
      log.debug({ messageId, responseBody }, 'WhatsApp ack message edited');
    }
  } catch (err) {
    log.warn({ err, messageId }, 'WhatsApp edit message error');
  }
}

/**
 * Send a WhatsApp text message, splitting at paragraph boundaries if > 4096 chars.
 * Returns the message ID of the first chunk (used for later deletion), or null on error.
 */
async function sendWhatsAppText(to: string, text: string, phoneNumberId: string, accessToken: string): Promise<string | null> {
  const log = getLogger();
  const MAX = 4096;
  const chunks: string[] = [];

  if (text.length <= MAX) {
    chunks.push(text);
  } else {
    // Split on double-newlines (paragraph breaks) to keep context intact
    const paragraphs = text.split(/\n\n+/);
    let current = '';
    for (const para of paragraphs) {
      const candidate = current ? `${current}\n\n${para}` : para;
      if (candidate.length <= MAX) {
        current = candidate;
      } else {
        if (current) chunks.push(current);
        current = para.slice(0, MAX);
      }
    }
    if (current) chunks.push(current);
  }

  let firstMessageId: string | null = null;
  for (const chunk of chunks) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(WHATSAPP_API_TIMEOUT_MS),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: chunk, preview_url: false },
      }),
    });
    const responseBody = await res.text();
    let data: any = null;
    try {
      data = responseBody ? JSON.parse(responseBody) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      log.warn({ status: res.status, body: responseBody, to }, 'WhatsApp text send failed');
      throw new Error(`WhatsApp text send failed with status ${res.status}`);
    }

    const messageId = data?.messages?.[0]?.id ?? null;
    if (firstMessageId === null) {
      firstMessageId = messageId;
    }

    log.debug({ to, messageId, length: chunk.length }, 'WhatsApp text sent');
  }
  return firstMessageId;
}

const router = Router();
const logger = getLogger();

/**
 * Download a WhatsApp media file by its media ID.
 */
async function downloadWhatsAppAudio(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    signal: AbortSignal.timeout(WHATSAPP_API_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) throw new Error(`Failed to get media URL: ${metaRes.status}`);
  const meta = await metaRes.json() as { url: string; mime_type: string };

  const audioRes = await fetch(meta.url, {
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`);
  const arrayBuffer = await audioRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mime_type };
}

/**
 * Transcribe audio with OpenAI Whisper (auto-detects Arabic vs English).
 */
async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<{ text: string; language: string }> {
  const openai = getOpenAI();
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'ogg';
  const tmpFile = path.join(os.tmpdir(), `wa_audio_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile) as any,
      model: 'whisper-1',
      response_format: 'verbose_json',
    }) as any;
    const language: string = transcription.language ?? 'en';
    return { text: transcription.text ?? '', language };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Convert text to speech using OpenAI TTS.
 * 'alloy' voice handles both Arabic and English.
 */
async function generateTTS(text: string): Promise<Buffer> {
  const openai = getOpenAI();
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'alloy',
    input: text,
    response_format: 'mp3',
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Upload audio buffer to Cloudinary and return a public URL.
 */
async function uploadAudioToCloudinary(buffer: Buffer): Promise<string> {
  const env = getEnv();
  const { v2 } = await import('cloudinary');
  v2.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  return new Promise((resolve, reject) => {
    const stream = v2.uploader.upload_stream(
      { resource_type: 'video', format: 'mp3', folder: 'whatsapp_tts' },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Send an audio file URL back as a WhatsApp audio message.
 */
async function sendWhatsAppAudio(to: string, audioUrl: string, phoneNumberId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    signal: AbortSignal.timeout(WHATSAPP_API_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { link: audioUrl },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.warn({ status: res.status, body }, 'WhatsApp audio send failed');
  } else {
    logger.debug({ to, audioUrl }, 'WhatsApp audio sent');
  }
}

router.get('/webhook', (req: Request, res: Response) => {
  const env = getEnv();
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge as string);
  } else {
    res.sendStatus(403);
  }
});

// Incoming messages
router.post('/webhook', async (req: Request, res: Response) => {
  // Acknowledge immediately — Meta retries if this doesn't return 200 quickly
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return;

    const from: string = message.from; // e.g. phone number
    if (!from) return;

    // Support text, image captions, and audio (voice notes)
    let incomingText = '';
    let isVoiceNote = false;
    let detectedLanguage = 'en';

    if (message.type === 'text') {
      incomingText = message.text?.body ?? '';
    } else if (message.type === 'image') {
      incomingText = message.caption ?? '';
    } else if (message.type === 'audio') {
      const env2 = getEnv();
      const mediaId: string = message.audio?.id;
      if (!mediaId) return;
      try {
        logger.info({ mediaId }, 'WhatsApp voice note received, transcribing...');
        const { buffer, mimeType } = await downloadWhatsAppAudio(mediaId, env2.WHATSAPP_ACCESS_TOKEN!);
        const transcription = await transcribeAudio(buffer, mimeType);
        incomingText = transcription.text;
        detectedLanguage = transcription.language === 'ar' ? 'ar' : 'en';
        isVoiceNote = true;
        logger.info({ incomingText, detectedLanguage }, 'Voice note transcribed');
      } catch (err) {
        logger.error({ err }, 'Failed to transcribe voice note');
        return;
      }
    } else {
      logger.info({ type: message.type }, 'WhatsApp: unsupported message type');
      return;
    }

    if (!incomingText || incomingText.trim().length === 0) return;

    const env = getEnv();
    const prisma = getPrisma();

    // Prefer the ephemeral typing indicator so the user sees only one final answer bubble.
    // If Meta rejects typing, fall back to the explicit searching message.
    const typingSent = await sendTypingIndicator(message.id, env.WHATSAPP_PHONE_NUMBER_ID!, env.WHATSAPP_ACCESS_TOKEN!);

    if (!typingSent) {
      await markAsRead(message.id, env.WHATSAPP_PHONE_NUMBER_ID!, env.WHATSAPP_ACCESS_TOKEN!);
      const ackMessageId = await sendWhatsAppText(from, '🔍 _Searching the knowledge base..._', env.WHATSAPP_PHONE_NUMBER_ID!, env.WHATSAPP_ACCESS_TOKEN!);
      logger.debug({ ackMessageId }, 'WhatsApp ack sent');
    }

    // Find or create a local user for this phone number so questions are stored
    const email = `whatsapp:${from}@whatsapp.local`;
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: 'whatsapp',
          fullName: `WhatsApp ${from}`,
          role: 'STUDENT' as any,
          isActive: true,
        },
      });
    }

    // Build simple history from recent Q/A pairs (helps context)
    const recent = await prisma.question.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 6, include: { answer: true } });
    const history: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const q of recent.reverse()) {
      history.push({ role: 'user', content: q.queryText });
      if (q.answer?.answerText) history.push({ role: 'assistant', content: q.answer.answerText });
    }

    // Call existing QA service with a guarded fallback so we can reply
    let result: any = null;
    try {
      result = await askQuestion(user.id, incomingText, history, detectedLanguage);
    } catch (qaErr) {
      // Log the error and send a polite fallback message back to the user
      logger.error({ err: qaErr }, 'askQuestion failed');
      const fallback = '❌ Sorry — the knowledge base search is temporarily unavailable. Please try again in a few minutes.';
      try {
          await sendWhatsAppText(from, fallback, env.WHATSAPP_PHONE_NUMBER_ID!, env.WHATSAPP_ACCESS_TOKEN!);
      } catch (sendErr) {
        logger.warn({ err: sendErr }, 'Failed to send WhatsApp fallback reply');
      }
      return;
    }

    const rawReply = (result && result.answerText) || 'Sorry, I could not find an answer.';
    const reply = formatForWhatsApp(rawReply);

    if (typingSent) {
      // Re-send typing right before the answer so it's always fresh/visible on the client.
      // WhatsApp sometimes misses the initial indicator if the chat wasn't open at that moment.
      await sendTypingIndicator(message.id, env.WHATSAPP_PHONE_NUMBER_ID!, env.WHATSAPP_ACCESS_TOKEN!);
      // Wait 1 s so the animation has time to render before the answer arrives.
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Send the answer as a new message (editing_of_message_id doesn't render on consumer WhatsApp)
    try {
      await sendWhatsAppText(from, reply, env.WHATSAPP_PHONE_NUMBER_ID!, env.WHATSAPP_ACCESS_TOKEN!);
    } catch (sendErr) {
      logger.warn({ err: sendErr, to: from }, 'Failed to send WhatsApp reply');
    }

    // If the user sent a voice note, also reply with a TTS audio message
    if (isVoiceNote) {
      try {
        logger.debug({ detectedLanguage }, 'Generating TTS reply for voice note...');
        // Strip markdown for clean speech
        const spokenText = rawReply
          .replace(/\*\*(.+?)\*\*/gs, '$1')
          .replace(/\*(.+?)\*/gs, '$1')
          .replace(/#{1,6} /g, '')
          .replace(/^[•\-] /gm, '')
          .replace(/`(.+?)`/g, '$1')
          .replace(/\n{2,}/g, '. ')
          .replace(/\n/g, ' ')
          .trim();
        const audioBuffer = await generateTTS(spokenText);
        const audioUrl = await uploadAudioToCloudinary(audioBuffer);
        await sendWhatsAppAudio(from, audioUrl, env.WHATSAPP_PHONE_NUMBER_ID!, env.WHATSAPP_ACCESS_TOKEN!);
        logger.info({ to: from }, 'WhatsApp TTS voice reply sent');
      } catch (ttsErr) {
        logger.warn({ err: ttsErr }, 'Failed to send TTS voice reply — text reply already sent');
      }
    }

    // Optionally send images returned by the QA service
    if (result?.images && Array.isArray(result.images) && result.images.length > 0) {
      const images = result.images as { url: string }[];
      for (const img of images.slice(0, 3)) {
        try {
          await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            signal: AbortSignal.timeout(WHATSAPP_API_TIMEOUT_MS),
            headers: {
              'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: from,
              type: 'image',
              image: { link: img.url },
            }),
          });
        } catch (imgErr) {
          logger.warn({ err: imgErr, url: img?.url }, 'Failed to send WhatsApp image');
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'WhatsApp webhook processing error');
  }
});

export default router;
