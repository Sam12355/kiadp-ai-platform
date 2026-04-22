import { Router, Request, Response } from 'express';
import { getEnv } from '../config/env.js';
import { getPrisma } from '../config/database.js';
import { askQuestion } from '../services/qa.service.js';
import { getLogger } from '../utils/logger.js';

const router = Router();
const logger = getLogger();

// Webhook verification endpoint used by Meta to validate the callback URL
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

    // Support text messages for now
    let incomingText = '';
    if (message.type === 'text') incomingText = message.text?.body ?? '';
    else if (message.type === 'image') incomingText = message.caption ?? '';
    else {
      logger.info({ type: message.type }, 'WhatsApp: unsupported message type');
      return;
    }

    if (!incomingText || incomingText.trim().length === 0) return;

    const prisma = getPrisma();
    const env = getEnv();

    // Find or create a local user for this phone number so questions are stored
    const email = `whatsapp:${from}@whatsapp.local`;
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: 'whatsapp',
          fullName: `WhatsApp ${from}`,
          role: 'CLIENT' as any,
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
      result = await askQuestion(user.id, incomingText, history, 'en');
    } catch (qaErr) {
      // Log the error and send a polite fallback message back to the user
      logger.error({ err: qaErr }, 'askQuestion failed');
      const fallback = 'Sorry — the knowledge base search is temporarily unavailable. Please try again in a few minutes.';
      try {
        await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: { body: String(fallback).slice(0, 4096) },
          }),
        });
      } catch (sendErr) {
        logger.warn({ err: sendErr }, 'Failed to send WhatsApp fallback reply');
      }
      return;
    }

    const reply = (result && result.answerText) || 'Sorry, I could not find an answer.';

    // Send text reply via WhatsApp Cloud API
    try {
      await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from,
          type: 'text',
          text: { body: String(reply).slice(0, 4096) },
        }),
      });
    } catch (sendErr) {
      logger.warn({ err: sendErr }, 'Failed to send WhatsApp reply');
    }

    // Optionally send images returned by the QA service
    if (result?.images && Array.isArray(result.images) && result.images.length > 0) {
      const images = result.images as { url: string }[];
      for (const img of images.slice(0, 3)) {
        try {
          await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
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
