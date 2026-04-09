import { WebSocketServer, WebSocket } from 'ws';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';
import fs from 'node:fs';

export function setupVoiceBridge(server: any) {
  const env = getEnv();
  const logger = getLogger();
  const wss = new WebSocketServer({ server, path: '/voice' });

  console.log('-------------------------------------------');
  console.log('🎤 [VOICE BRIDGE ACTIVE] listening on /voice');
  console.log('-------------------------------------------');

  wss.on('connection', (ws, req) => {
    logger.info(`Voice bridge: Client connected from ${req.socket.remoteAddress}`);
    
    if (!env.GEMINI_API_KEY) {
      logger.error('Voice bridge: GEMINI_API_KEY is not configured');
      ws.close(1011, 'Gemini API Key missing');
      return;
    }

    // The EXACT HeyGPT "Secret Recipe" that works for you
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${env.GEMINI_API_KEY}`;
    const geminiWs = new WebSocket(geminiUrl);

    geminiWs.on('open', () => {
      logger.info('Voice bridge: Connected to Google Gemini Live API (HeyGPT Mode)');
      
      // Send a COMPLETE setup message with the HeyGPT-verified model
      const setupMsg = {
        setup: {
          model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
          generationConfig: {
            responseModalities: ["AUDIO"]
          }
        }
      };
      geminiWs.send(JSON.stringify(setupMsg));

      // Also tell the frontend that we are ready
      ws.send(JSON.stringify({ setupComplete: true }));
    });

    // Piping: browser -> Gemini
    ws.on('message', (data) => {
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(data);
      }
    });

    // Piping: Gemini -> browser (preserve text/binary frame type)
    geminiWs.on('message', (data: Buffer, isBinary: boolean) => {
      if (ws.readyState === WebSocket.OPEN) {
        if (isBinary) {
          logger.info(`Voice bridge: Gemini sent BINARY frame, ${data.length} bytes`);
          ws.send(data);
        } else {
          const text = data.toString();
          // Log a truncated preview of the JSON structure
          const preview = text.length > 300 ? text.substring(0, 300) + '...' : text;
          logger.info(`Voice bridge: Gemini sent TEXT frame (${text.length} chars): ${preview}`);
          ws.send(text);
        }
      }
    });

    geminiWs.on('error', (err) => {
      const errorMsg = `Voice bridge: Gemini API connection error: ${err.message}`;
      logger.error(errorMsg);
      fs.appendFileSync('voice_debug.log', `${new Date().toISOString()} ERROR: ${errorMsg}\n`);
      ws.close(1011, 'Gemini API Error');
    });

    geminiWs.on('close', (code, reason) => {
      const closeMsg = `Voice bridge: Gemini connection closed: Code ${code}, Reason: ${reason}`;
      logger.warn(closeMsg);
      fs.appendFileSync('voice_debug.log', `${new Date().toISOString()} CLOSE: ${closeMsg}\n`);
      ws.close(code, reason);
    });

    ws.on('close', () => {
      logger.info('Voice bridge: Client disconnected');
      if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
        geminiWs.close();
      }
    });

    ws.on('error', (err) => {
      logger.error(`Voice bridge: Client socket error: ${err.message}`);
      geminiWs.close();
    });
  });

  logger.info('Voice bridge: WebSocket server initialized on /api/voice');
}
