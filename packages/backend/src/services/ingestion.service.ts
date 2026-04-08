import fs from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';
import { getPrisma } from '../config/database.js';
import { getOpenAI } from '../config/openai.js';
import { getPinecone } from '../config/pinecone.js';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';
import { uploadToCloudinary, uploadBufferToCloudinary } from './storage.service.js';
import crypto from 'node:crypto';
const MAX_CHUNK_LENGTH = 1500; // rough approx for ~500 tokens
const CHUNK_OVERLAP = 150;     // rough approx for ~50 tokens

// ── Service Logic ──

export async function processDocument(documentId: string, filePath: string): Promise<void> {
  const prisma = getPrisma();
  const logger = getLogger();
  const env = getEnv();

  logger.info(`Starting processing for document ${documentId}`);

  try {
    // 1. Update status to PROCESSING
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING', progress: 5 },
    });

    // 2. Read PDF using pdf.js
    const data = await fs.readFile(filePath);
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    const pageCount = pdf.numPages;
    
    await prisma.document.update({
      where: { id: documentId },
      data: { pageCount, progress: 10 },
    });

    // Prepare AI & Storage
    const openai = getOpenAI();
    const pinecone = getPinecone();
    const pineconeIndex = pinecone.Index(env.PINECONE_INDEX_NAME);

    // 3. Extract text & Visual analysis page by page
    const chunks: { pageNumber: number; text: string; chunkIndex: number }[] = [];
    const documentUrl = await uploadToCloudinary(filePath, 'kiadp/documents', 'image');
    
    if (!documentUrl) {
      logger.warn(`⚠️ Document ${documentId} is too large or failed to upload to Cloudinary. Vision analysis will be skipped, but text will be processed.`);
    }

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const operatorList = await page.getOperatorList();
      
      // Check if the page contains any image objects or complex graphics
      const hasVisuals = operatorList.fnArray.some(fn => 
        fn === (pdfjs as any).OPS.paintImageXObject || 
        fn === (pdfjs as any).OPS.paintInlineImageXObject ||
        fn === (pdfjs as any).OPS.shadingFill
      );

      const textItems = textContent.items.map((item: any) => item.str).join(' ');
      let fullPageText = textItems.trim();

      // [VISUAL ANALYSIS] Only run if page has potential visual elements
      const dynamicImageUrl = documentUrl ? documentUrl.replace('/upload/', `/upload/pg_${pageNum}/`).replace('.pdf', '.jpg') : null;
      
      if (hasVisuals && dynamicImageUrl && fullPageText.length > 50) {
        let retries = 3;
        while (retries > 0) {
          try {
            // 1. Fetch the rendered image from Cloudinary to get raw buffer
            const imgFetch = await fetch(dynamicImageUrl);
            if (!imgFetch.ok) throw new Error(`Failed to fetch page image: ${imgFetch.statusText}`);
            const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
            const base64Image = imgBuffer.toString('base64');

            // 2. Clearer Permanent Upload (optional)
            const permanentImageUrl = await uploadBufferToCloudinary(imgBuffer, `kiadp/images/${documentId}`, `page_${pageNum}.jpg`);

            // 3. Ask OpenAI Vision using the Base64 data
            const visionResponse = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: "Identify and describe only INFORMATIVE scientific elements (charts, tables, diagrams, or pest photos). IGNORE decorations/logos. If no info visuals exist, respond 'No informative visuals found.' Be concise for search." },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                  ]
                }
              ],
              max_tokens: 300
            });
            
            const visualDescription = visionResponse.choices[0].message.content;
            if (visualDescription && !visualDescription.includes('No visuals found') && !visualDescription.includes('No informative visuals found')) {
              chunks.push({
                pageNumber: pageNum,
                text: `[Visual Evidence from Page ${pageNum}]: ${visualDescription}`,
                chunkIndex: 999 + pageNum
              });
              
              await prisma.documentImage.create({
                data: {
                  documentId,
                  pageNumber: pageNum,
                  filePath: permanentImageUrl || dynamicImageUrl,
                  description: visualDescription,
                  altText: `Figure on page ${pageNum}`
                }
              });
            }
            break; // Success! Exit retry loop.
          } catch (vErr: any) {
            if (vErr.status === 429) {
              logger.warn(`Rate limit hit on p${pageNum}, waiting 2s...`);
              await new Promise(res => setTimeout(res, 2000));
              retries--;
            } else {
              logger.warn(`Vision analysis failed for p${pageNum}: ${vErr}`);
              break; // Other errors don't retry.
            }
          }
        }
        // Small delay between pages to avoid TPM spike
        await new Promise(res => setTimeout(res, 500));
      }

      if (fullPageText.length === 0) continue;

      // Extract chunks
      let startIndex = 0;
      let chunkIdx = 0;
      while (startIndex < fullPageText.length) {
        const chunkText = fullPageText.slice(startIndex, startIndex + MAX_CHUNK_LENGTH);
        chunks.push({
          pageNumber: pageNum,
          text: chunkText,
          chunkIndex: chunkIdx++,
        });
        startIndex += (MAX_CHUNK_LENGTH - CHUNK_OVERLAP);
      }

      // Progress from 10% to 40% based on pages
      const extractionProgress = Math.floor(10 + (pageNum / pageCount) * 30);
      await prisma.document.update({
        where: { id: documentId },
        data: { progress: extractionProgress },
      });
    }

    if (chunks.length === 0) {
      throw new Error('No valid text could be extracted from this PDF');
    }

    logger.info(`Extracted ${chunks.length} chunks. Generating embeddings...`);

    // Process in batches of 100 to avoid OpenAI rate limits
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const texts = batchChunks.map(c => c.text);

      const embeddingResponse = await openai.embeddings.create({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: texts,
      });

      const vectorsToUpsert = batchChunks.map((chunk, idx) => {
        const pineconeVectorId = `doc_${documentId}_p${chunk.pageNumber}_c${chunk.chunkIndex}_${crypto.randomUUID()}`;
        return {
          id: pineconeVectorId,
          values: embeddingResponse.data[idx].embedding,
          metadata: {
            documentId,
            pageNumber: chunk.pageNumber,
            text: chunk.text,
            type: chunk.chunkIndex >= 999 ? 'visual' : 'text'
          },
        };
      });

      await pineconeIndex.upsert(vectorsToUpsert);

      await prisma.documentChunk.createMany({
        data: vectorsToUpsert.map((v, idx) => ({
          documentId,
          content: batchChunks[idx].text,
          pageNumber: batchChunks[idx].pageNumber,
          chunkIndex: batchChunks[idx].chunkIndex,
          pineconeVectorId: v.id,
          tokenCount: Math.ceil(batchChunks[idx].text.length / 4),
        })),
      });

      // Progress from 40% to 95% based on batches
      const batchProgress = Math.floor(40 + (i / chunks.length) * 55);
      await prisma.document.update({
        where: { id: documentId },
        data: { progress: batchProgress },
      });

      logger.info(`Processed batch ${i / BATCH_SIZE + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`);
    }

    // 5. Generate AI Summary from the first ~4000 chars of extracted text
    logger.info(`Generating AI summary for document ${documentId}...`);
    try {
      const allText = chunks.slice(0, 8).map(c => c.text).join('\n\n');
      const textForSummary = allText.slice(0, 4000);

      const summaryResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert agricultural knowledge assistant. Analyze the following document excerpt and categorize it into the most relevant "Smart Folders". respond ONLY with a valid JSON object.
            
Smart Folders keys:
- "PESTS_DISEASE_MANAGEMENT"
- "CULTIVATION_BIOLOGY"
- "EARLY_DETECTION_AI"
- "IRRIGATION_SOIL_HEALTH"
- "POST_HARVEST_ECONOMICS"
- "ENVIRONMENTAL_IMPACT"

Format (Strict JSON):
{
  "summary": "A 2-3 sentence overview.",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "topics": ["topic1", "topic2"],
  "suggestedCategories": ["PESTS_DISEASE_MANAGEMENT", "EARLY_DETECTION_AI"]
}`
          },
          {
            role: 'user',
            content: `Document text:\n\n${textForSummary}`
          }
        ],
        temperature: 0.3,
        max_tokens: 600,
      });

      const rawJson = summaryResponse.choices[0]?.message?.content?.trim() || '{}';
      let aiMeta: any = {};
      try {
        aiMeta = JSON.parse(rawJson);
      } catch {
        logger.warn(`Failed to parse summary JSON for ${documentId}: ${rawJson}`);
      }

      await prisma.document.update({
        where: { id: documentId },
        data: {
          categories: aiMeta.suggestedCategories || [],
          metadata: {
            summary: aiMeta.summary || null,
            keyPoints: aiMeta.keyPoints || [],
            topics: aiMeta.topics || [],
            summaryGeneratedAt: new Date().toISOString(),
          },
        },
      });

      logger.info(`AI summary generated for document ${documentId}`);
    } catch (summaryError) {
      // Non-fatal — log and continue
      logger.warn({ err: summaryError }, `Summary generation failed for ${documentId}, continuing without it`);
    }

    // 6. Update final status to COMPLETED
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'COMPLETED', progress: 100 },
    });

    logger.info(`Document ${documentId} thoroughly processed!`);

  } catch (error) {
    logger.error({ err: error }, `Error processing document ${documentId}`);
    await prisma.document.update({
      where: { id: documentId },
      data: { 
        status: 'FAILED',
        // In real app, add an errorMessage column
      },
    });
    throw error;
  }
}

export async function deleteDocument(documentId: string, vectorIds: string[]): Promise<void> {
  const logger = getLogger();
  const env = getEnv();
  const pinecone = getPinecone();
  const pineconeIndex = pinecone.Index(env.PINECONE_INDEX_NAME);

  logger.info(`Starting vector deletion for document ${documentId} (${vectorIds.length} vectors)`);

  try {
    // Delete in batches of 1000 (Pinecone limit for delete command by IDs)
    const BATCH_SIZE = 1000;
    for (let i = 0; i < vectorIds.length; i += BATCH_SIZE) {
      const batchIds = vectorIds.slice(i, i + BATCH_SIZE);
      await pineconeIndex.deleteMany(batchIds);
      logger.info(`Deleted batch ${i / BATCH_SIZE + 1} of vectors for doc ${documentId}`);
    }
  } catch (error) {
    logger.error({ err: error }, `Error deleting vectors for document ${documentId}`);
    throw error;
  }
}
