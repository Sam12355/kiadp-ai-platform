/**
 * rechunk.ts — Re-process all COMPLETED documents with semantic chunking.
 *
 * - Keeps visual chunks (chunk_index >= 999) untouched.
 * - Deletes old text chunks (chunk_index < 999) and replaces them with
 *   semantically-bounded chunks (sentence boundaries, ~1000 chars target).
 * - Reads per-page raw text from document_pages if available, otherwise
 *   re-fetches the PDF from Cloudinary and re-extracts with pdfjs.
 * - Re-embeds all new text chunks with OpenAI + stores in pgvector.
 *
 * Usage: npx tsx scripts/rechunk.ts
 */

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import crypto from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

// ── Semantic chunking (mirrors ingestion.service.ts) ──

function splitIntoSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(/(?<=[.!?\u060C\u061B\u061F])\s+(?=[A-Z0-9"'(\u0600-\u06FF])/);
  return parts.map(s => s.trim()).filter(s => s.length >= 25);
}

function detectHeading(text: string): string | null {
  const numbered = text.match(/\b(\d+\.\d+(?:\.\d+)?)\s+([A-Z][A-Za-z ,'-]{3,50})(?=[\s\n]|$)/g);
  if (numbered && numbered.length > 0) {
    const last = numbered[numbered.length - 1].trim();
    if (!/^\d+\.\d+\s+\d/.test(last)) return last.substring(0, 60);
  }
  const caps = text.match(/(?:^|\n)([A-Z]{5,}(?:\s+[A-Z]{2,}){0,4})/);
  if (caps) return caps[1].substring(0, 60);
  return null;
}

function buildSemanticChunks(
  pageTexts: { pageNumber: number; text: string }[]
): { pageNumber: number; text: string; chunkIndex: number }[] {
  const TARGET_CHARS = 800;
  const MAX_CHARS = 1300;
  const OVERLAP = 1;

  const chunks: { pageNumber: number; text: string; chunkIndex: number }[] = [];
  let chunkIdx = 0;
  let currentHeading: string | null = null;

  for (const { pageNumber, text } of pageTexts) {
    const pageHeading = detectHeading(text);
    if (pageHeading) currentHeading = pageHeading;

    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) continue;

    let i = 0;
    while (i < sentences.length) {
      const picked: string[] = [];
      let totalLen = 0;
      let j = i;

      let chunkHeading = currentHeading;
      for (let k = i; k < Math.min(i + 3, sentences.length); k++) {
        const h = detectHeading(sentences[k]);
        if (h) { chunkHeading = h; currentHeading = h; break; }
      }

      while (j < sentences.length) {
        const slen = sentences[j].length + 1;
        if (picked.length > 0 && totalLen + slen > MAX_CHARS) break;
        picked.push(sentences[j]);
        totalLen += slen;
        j++;
        if (totalLen >= TARGET_CHARS) break;
      }

      if (picked.length === 0) { i++; continue; }

      const body = picked.join(' ');
      const text_with_heading = chunkHeading ? `[${chunkHeading}] ${body}` : body;
      chunks.push({ pageNumber, text: text_with_heading, chunkIndex: chunkIdx++ });
      i = Math.max(i + 1, j - OVERLAP);
    }
  }

  return chunks;
}

// ── PDF text extraction ──

async function extractPageTexts(pdfBuffer: Buffer): Promise<{ pageNumber: number; text: string }[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const results: { pageNumber: number; text: string }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 0) results.push({ pageNumber: p, text });
  }
  return results;
}

async function fetchPdfBuffer(doc: { storedFilename: string; filePath: string }): Promise<Buffer> {
  const { default: fs } = await import('node:fs/promises');

  // Try local file first (avoids Cloudinary auth issues)
  const localPaths = [
    doc.filePath,
    `uploads/${doc.filePath.replace(/\\/g, '/').replace(/^uploads\/?/, '')}`,
  ];
  for (const lp of localPaths) {
    try { return await fs.readFile(lp); } catch { /* try next */ }
  }

  // Try direct Cloudinary URL (works for public assets)
  if (doc.storedFilename?.startsWith('http')) {
    try {
      const direct = await fetch(doc.storedFilename);
      if (direct.ok) return Buffer.from(await direct.arrayBuffer());
    } catch { /* fall through */ }

    // Signed private download URL
    const publicId = doc.storedFilename
      .split('/upload/')[1]
      ?.split('/').slice(1).join('/')
      .replace(/\.[^/.]+$/, '');
    const signedUrl = cloudinary.utils.private_download_url(publicId, 'pdf', { resource_type: 'image' });
    const signed = await fetch(signedUrl);
    if (signed.ok) return Buffer.from(await signed.arrayBuffer());
    throw new Error(`All fetch attempts failed. Cloudinary: ${signed.status} ${signedUrl}`);
  }

  throw new Error(`Cannot fetch PDF: no local file at ${doc.filePath} and no HTTP URL`);
}

// ── Main rechunk logic ──

async function rechunkDocument(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document ${documentId} not found`);

  console.log(`\n[${doc.title}] Starting rechunk...`);

  // 1. Try to get page texts from document_pages table first (avoids refetching PDF)
  let pageTexts: { pageNumber: number; text: string }[];
  const storedPages = await prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNumber: 'asc' },
  });

  if (storedPages.length > 0) {
    console.log(`  Using ${storedPages.length} stored pages from DB`);
    pageTexts = storedPages.map(p => ({ pageNumber: p.pageNumber, text: p.rawText }));
  } else {
    console.log(`  No stored pages — fetching PDF from Cloudinary...`);
    const pdfBuffer = await fetchPdfBuffer({ storedFilename: doc.storedFilename, filePath: doc.filePath });
    pageTexts = await extractPageTexts(pdfBuffer);
    console.log(`  Extracted ${pageTexts.length} pages from PDF`);

    // Persist for next time
    for (const { pageNumber, text } of pageTexts) {
      await prisma.documentPage.upsert({
        where: { documentId_pageNumber: { documentId, pageNumber } },
        create: { documentId, pageNumber, rawText: text, wordCount: text.split(/\s+/).length, isOcr: false },
        update: { rawText: text },
      });
    }
  }

  // 2. Build new semantic chunks
  const newChunks = buildSemanticChunks(pageTexts);
  console.log(`  Built ${newChunks.length} semantic chunks`);

  // 3. Delete old text chunks only (keep visual chunks >= 999)
  const deleted = await prisma.documentChunk.deleteMany({
    where: { documentId, chunkIndex: { lt: 999 } },
  });
  console.log(`  Deleted ${deleted.count} old text chunks`);

  // 4. Embed and store new chunks in batches
  const BATCH = 100;
  let stored = 0;
  for (let i = 0; i < newChunks.length; i += BATCH) {
    const batch = newChunks.slice(i, i + BATCH);
    const embedResp = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map(c => c.text),
    });

    const records = batch.map((c, idx) => ({
      documentId,
      content: c.text,
      pageNumber: c.pageNumber,
      chunkIndex: c.chunkIndex,
      pineconeVectorId: `rechunk_${documentId}_p${c.pageNumber}_c${c.chunkIndex}_${crypto.randomUUID()}`,
      tokenCount: Math.ceil(c.text.length / 4),
      embedding: embedResp.data[idx].embedding,
    }));

    // Insert records without embedding column first, then update embedding via raw SQL
    await prisma.documentChunk.createMany({
      data: records.map(r => ({
        documentId: r.documentId,
        content: r.content,
        pageNumber: r.pageNumber,
        chunkIndex: r.chunkIndex,
        pineconeVectorId: r.pineconeVectorId,
        tokenCount: r.tokenCount,
      })),
    });

    // Store embeddings in pgvector
    for (const r of records) {
      const vectorStr = `[${r.embedding.join(',')}]`;
      await prisma.$executeRaw`
        UPDATE document_chunks
        SET embedding = ${vectorStr}::vector
        WHERE document_id = ${documentId}::uuid
          AND chunk_index = ${r.chunkIndex}
          AND pinecone_vector_id = ${r.pineconeVectorId}
      `;
    }

    stored += batch.length;
    console.log(`  Embedded ${stored}/${newChunks.length} chunks`);
  }

  // 5. Update chunk count on document
  const totalChunks = await prisma.documentChunk.count({ where: { documentId } });
  await prisma.document.update({
    where: { id: documentId },
    data: { chunkCount: totalChunks },
  });

  console.log(`  Done. ${newChunks.length} text chunks + visual chunks = ${totalChunks} total`);
}

async function main() {
  const docs = await prisma.document.findMany({
    where: { status: 'COMPLETED' },
    select: { id: true, title: true },
  });

  console.log(`Found ${docs.length} completed documents to rechunk.`);

  for (const doc of docs) {
    try {
      await rechunkDocument(doc.id);
    } catch (err: any) {
      console.error(`  ERROR rechunking [${doc.title}]: ${err.message}`);
    }
  }

  console.log('\nAll done!');
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
