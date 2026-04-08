import { WebSocketServer, WebSocket } from 'ws';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';
import fs from 'node:fs';

export function setupVoiceBridge(server: any) {
  const env = getEnv();
  const logger = getLogger();
  const wss = new WebSocketServer({ server, path: '/api/voice' });

  wss.on('connection', (ws, req) => {
    logger.info(`Voice bridge: Client connected from ${req.socket.remoteAddress}`);
    
    if (!env.GEMINI_API_KEY) {
      logger.error('Voice bridge: GEMINI_API_KEY is not configured');
      ws.close(1011, 'Gemini API Key missing');
      return;
    }

    // Connect to Gemini Multimodal Live API
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BiDiGenerateContent?key=${env.GEMINI_API_KEY}`;
    const geminiWs = new WebSocket(geminiUrl);

    // RESTORE PIPING: user -> Gemini
    ws.on('message', (data) => {
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(data);
      }
    });

    // RESTORE PIPING: Gemini -> user
    geminiWs.on('message', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    geminiWs.on('open', () => {
      logger.info('Voice bridge: Connected to Google Gemini Live API');
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
