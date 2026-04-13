import 'dotenv/config';
import { describeImage } from '../src/services/vision.service.js';
import sharp from 'sharp';

// Create a tiny test image (a red square)
const buf = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toBuffer();
const b64 = buf.toString('base64');

console.log('Testing vision service (Gemini Flash -> GPT-4o fallback)...');
const t0 = Date.now();
const desc = await describeImage(b64, 'What color is this image? Reply in one sentence.');
console.log(`Result (${Date.now() - t0}ms):`, desc);
process.exit(0);
