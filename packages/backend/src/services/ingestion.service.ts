import fs from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';
import { getPrisma } from '../config/database.js';
import { getOpenAI } from '../config/openai.js';
import { getPinecone } from '../config/pinecone.js';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';
import { uploadToCloudinary, uploadBufferToCloudinary, configureCloudinary } from './storage.service.js';
import { v2 as cloudinary } from 'cloudinary';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { describeImage } from './vision.service.js';
import { embedTexts } from './embedding.service.js';

// ── Semantic chunking helpers ──

/** Split text into sentences at punctuation followed by whitespace + uppercase/Arabic/digit. */
function splitIntoSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(/(?<=[.!?\u060C\u061B\u061F])\s+(?=[A-Z0-9"'(\u0600-\u06FF])/);
  return parts.map(s => s.trim()).filter(s => s.length >= 25);
}

/**
 * Detect the last section heading in a page's text.
 * Matches patterns like: "1.4 Traditional Foods", "6.2.1 Red Palm Weevil", "CHAPTER 3"
 * Returns the heading string or null if none found.
 */
function detectHeading(text: string): string | null {
  // Numbered section requires at least one decimal: "1.4 Title" or "1.4.2 Title"
  // Rejects bare integers like "9 Section" which are footnotes/page numbers
  const numbered = text.match(/\b(\d+\.\d+(?:\.\d+)?)\s+([A-Z][A-Za-z ,'-]{3,50})(?=[\s\n]|$)/g);
  if (numbered && numbered.length > 0) {
    const last = numbered[numbered.length - 1].trim();
    // Reject if followed by a digit (measurement like "27,500 t" or "2.5 km")
    if (!/^\d+\.\d+\s+\d/.test(last)) return last.substring(0, 60);
  }
  // ALL-CAPS heading: "CHAPTER 3", "INTRODUCTION" (min 5 chars, not ALL single words that appear mid-sentence)
  const caps = text.match(/(?:^|\n)([A-Z]{5,}(?:\s+[A-Z]{2,}){0,4})/);
  if (caps) return caps[1].substring(0, 60);
  return null;
}

/**
 * Group sentences into semantic chunks targeting ~800 chars with 1-sentence overlap.
 * Processes each page independently — chunks never cross page boundaries.
 * Prefixes each chunk with the nearest detected section heading.
 */
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
    // Update heading from this page if a new one is detected
    const pageHeading = detectHeading(text);
    if (pageHeading) currentHeading = pageHeading;

    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) continue;

    let i = 0;
    while (i < sentences.length) {
      const picked: string[] = [];
      let totalLen = 0;
      let j = i;

      // Check if any sentence in this window introduces a new heading
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

configureCloudinary();

/**
 * Extract contextual text for an image from the page text.
 * Returns the figure caption (e.g. "Figure 10: Traditional drying...") and
 * the surrounding paragraph text that describes the image.
 * This gets stored with the image and used for embedding/retrieval.
 */
function extractImageContext(fullPageText: string, imgIndex: number): string {
  const parts: string[] = [];

  // 1. Extract ALL figure/table captions from the page
  // Captions look like: "Figure 10:   Traditional drying and processing of harvested dates in Siwa."
  const fullCaptionRegex = /(?:Figure|Fig\.?|Table|Plate)\s+\d+\s*[:.]?\s+[A-Z][^.]{10,150}\./gi;
  const shortRefRegex = /(?:Figure|Fig\.?|Table|Plate)\s+\d+[^.]*\./gi;
  
  const fullCaptions = fullPageText.match(fullCaptionRegex);
  const shortCaptions = fullPageText.match(shortRefRegex);
  const captions = fullCaptions && fullCaptions.length > 0 ? fullCaptions : shortCaptions;
  const caption = captions ? (captions[imgIndex] ?? captions[0])?.trim() : null;
  if (caption) {
    parts.push(caption);
  }

  // 2. Extract ONLY the paragraph that directly references THIS image's caption
  // NOT all paragraphs on the page — that pulls in unrelated section text.
  // e.g. p26 has Fig 9 (pollination) AND the "date harvest" section start;
  // we must NOT attach the harvest text to the pollination image.
  const paragraphs = fullPageText.split(/\n{2,}|\r?\n(?=[A-Z0-9\u0600-\u06FF])/)
    .map(p => p.trim())
    .filter(p => p.length > 40);

  if (caption) {
    // Extract the figure number from the caption (e.g. "10" from "Figure 10: ...")
    const figNumMatch = caption.match(/(?:Figure|Fig\.?|Table|Plate)\s+(\d+)/i);
    const figNum = figNumMatch?.[1];
    if (figNum) {
      // Only include paragraphs that reference THIS specific figure number
      const thisRefRegex = new RegExp(`(?:Figure|Fig\\.?)\\s+${figNum}\\b`, 'i');
      for (const p of paragraphs) {
        if (thisRefRegex.test(p) && !parts.some(existing => existing.includes(p.substring(0, 50)))) {
          parts.push(p);
        }
      }
    }
  } else {
    // No caption found — fall back to first paragraph as context
    if (paragraphs.length > 0) {
      parts.push(paragraphs[0]);
    }
  }

  // Limit total context to ~1200 chars to keep embeddings focused
  let result = parts.join('\n\n');
  if (result.length > 1200) result = result.substring(0, 1200);
  return result;
}

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
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error(`Document ${documentId} not found in database`);

    let data: Buffer;
    try {
      data = await fs.readFile(filePath);
    } catch (readErr) {
      logger.info(`Local file not found at ${filePath}. Attempting Cloudinary fallback for doc ${documentId}...`);
      if (doc.storedFilename && doc.storedFilename.startsWith('http')) {
        // Extract Public ID for signing
        const pdfPublicId = doc.storedFilename.split('/upload/')[1]?.split('/').slice(1).join('/').replace(/\.[^/.]+$/, '');
        
        configureCloudinary();
        
        // Use the dedicated private download URL generator for maximum reliability with restricted assets
        const signedFetchUrl = cloudinary.utils.private_download_url(pdfPublicId, 'pdf', {
          resource_type: 'image'
        });

        const fetchResp = await fetch(signedFetchUrl);
        if (!fetchResp.ok) throw new Error(`Cloudinary fallback failed (${fetchResp.status}): ${signedFetchUrl}`);
        data = Buffer.from(await fetchResp.arrayBuffer());
      } else {
        throw new Error(`File not found locally and no Cloudinary URL available for ${documentId}`);
      }
    }

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
    const pageTexts: { pageNumber: number; text: string }[] = [];
    const documentUrl = await uploadToCloudinary(filePath, 'kiadp/documents', 'image');
    
    if (!documentUrl) {
      logger.warn(`⚠️ Document ${documentId} is too large or failed to upload to Cloudinary. Vision analysis will be skipped, but text will be processed.`);
    }

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const operatorList = await page.getOperatorList();
      
      const textItems = textContent.items.map((item: any) => item.str).join(' ');
      let fullPageText = textItems.trim();

      // Check if the page contains any image objects OR keywords like Figure/Table
      const hasVisualsInOps = operatorList.fnArray.some(fn => 
        fn === (pdfjs as any).OPS.paintImageXObject || 
        fn === (pdfjs as any).OPS.paintInlineImageXObject ||
        fn === (pdfjs as any).OPS.shadingFill
      );
      
      const hasKeywords = /figure|table|chart|illustration|plate|شكل|جدول|صورة|رسم|توضيح/i.test(fullPageText);
      const shouldAnalyzeVisuals = hasVisualsInOps || hasKeywords;
 
      // [VISUAL ANALYSIS] Hybrid: extract individual XObject images, fall back to full-page for vector visuals
      const dynamicImageUrl = documentUrl ? documentUrl.replace('/upload/', `/upload/pg_${pageNum}/`).replace('.pdf', '.jpg') : null;

      // ── Try extracting individual Image XObjects first ──
      const xobjectImages: { name: string; width: number; height: number; data: Uint8ClampedArray }[] = [];
      if (hasVisualsInOps) {
        const seenNames = new Set<string>();
        for (let opIdx = 0; opIdx < operatorList.fnArray.length; opIdx++) {
          if (operatorList.fnArray[opIdx] === (pdfjs as any).OPS.paintImageXObject) {
            const imgName = operatorList.argsArray[opIdx][0];
            if (seenNames.has(imgName)) continue;
            seenNames.add(imgName);
            try {
              const imgObj = await new Promise<any>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
                page.objs.get(imgName, (obj: any) => { clearTimeout(timeout); resolve(obj); });
              });
              // Skip tiny images (logos, bullets, decorations)
              if (imgObj && imgObj.width >= 150 && imgObj.height >= 150) {
                xobjectImages.push({ name: imgName, width: imgObj.width, height: imgObj.height, data: imgObj.data });
              }
            } catch { /* timeout – skip */ }
          }
        }
      }

      if (xobjectImages.length > 0 && fullPageText.length > 50) {
        // ── Path A: Individual XObject extraction ──
        logger.info(`  p${pageNum}: extracting ${xobjectImages.length} individual image(s)`);
        for (let imgIdx = 0; imgIdx < xobjectImages.length; imgIdx++) {
          const img = xobjectImages[imgIdx];
          let retries = 3;
          while (retries > 0) {
            try {
              const channels = Math.round(img.data.length / (img.width * img.height));
              if (channels !== 1 && channels !== 3 && channels !== 4) break; // unsupported format
              const jpegBuffer = await sharp(Buffer.from(img.data), {
                raw: { width: img.width, height: img.height, channels: channels as 1 | 3 | 4 }
              }).jpeg({ quality: 85 }).toBuffer();

              const imageUrl = await uploadBufferToCloudinary(
                jpegBuffer, `kiadp/images/${documentId}`, `page_${pageNum}_img_${imgIdx + 1}.jpg`
              );
              const base64Image = jpegBuffer.toString('base64');

              const pageContext = fullPageText.substring(0, 600);
              const visionPrompt = `Describe this visual element (photo, chart, table, map, diagram, infographic). MANDATORY: If it has a label (e.g., 'Figure 5:', 'Table 1:'), transcribe that label word-for-word at the beginning. Use the exact scientific names, species names, and terminology from the surrounding page text below. Be detailed and specific.\n\nPAGE TEXT CONTEXT:\n${pageContext}`;
              const visualDescription = await describeImage(base64Image, visionPrompt);
              if (visualDescription && !visualDescription.includes('No visuals found') && !visualDescription.includes('No informative visuals found')) {
                const contextText = extractImageContext(fullPageText, imgIdx);
                // Use contextText for embedding (much better for retrieval than AI description alone)
                const embeddingText = contextText
                  ? `[Visual Evidence from Page ${pageNum}]: ${contextText}\n\n${visualDescription}`
                  : `[Visual Evidence from Page ${pageNum}]: ${visualDescription}`;
                // IMPORTANT: create the DB record FIRST, push the chunk AFTER.
                // If documentImage.create fails (e.g. schema mismatch), no orphaned
                // visual chunk is left pointing to a non-existent image row.
                if (!imageUrl) logger.warn(`Cloudinary upload failed for p${pageNum} img ${imgIdx + 1}, using dynamic URL fallback`);
                await prisma.documentImage.create({
                  data: {
                    documentId,
                    pageNumber: pageNum,
                    filePath: imageUrl || dynamicImageUrl || '',
                    description: visualDescription,
                    contextText: contextText || null,
                    altText: `Image ${imgIdx + 1} on page ${pageNum}`,
                    width: img.width,
                    height: img.height,
                  }
                });
                chunks.push({
                  pageNumber: pageNum,
                  text: embeddingText,
                  chunkIndex: 10000 + pageNum * 10 + imgIdx
                });
              }
              break;
            } catch (vErr: any) {
              logger.warn(`Vision analysis failed for p${pageNum} img ${imgIdx + 1}: ${vErr}`);
              retries--;
              if (retries > 0) await new Promise(res => setTimeout(res, 2000));
            }
          }
          await new Promise(res => setTimeout(res, 500));
        }
      } else if (shouldAnalyzeVisuals && dynamicImageUrl && fullPageText.length > 50) {
        // ── Path B: Full-page render fallback (vector charts, tables, diagrams) ──
        logger.info(`  p${pageNum}: full-page render (vector visuals)`);
        let retries = 3;
        while (retries > 0) {
          try {
            const imgFetch = await fetch(dynamicImageUrl);
            if (!imgFetch.ok) throw new Error(`Failed to fetch page image: ${imgFetch.statusText}`);
            const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
            const base64Image = imgBuffer.toString('base64');

            const permanentImageUrl = await uploadBufferToCloudinary(imgBuffer, `kiadp/images/${documentId}`, `page_${pageNum}.jpg`);

            const pageContext = fullPageText.substring(0, 600);
            const visionPrompt = `Describe ALL visual elements on this page (photos, charts, tables, maps, diagrams). MANDATORY: If an element is labeled (e.g., 'Figure 5:', 'Table 1:'), you MUST transcribe that label word-for-word at the beginning of its description. Use the exact scientific names, species names, and terminology from the surrounding page text below. We need to match user questions exactly.\n\nPAGE TEXT CONTEXT:\n${pageContext}`;
            const visualDescription = await describeImage(base64Image, visionPrompt);
            if (visualDescription && !visualDescription.includes('No visuals found') && !visualDescription.includes('No informative visuals found')) {
              const contextText = extractImageContext(fullPageText, 0);
              const embeddingText = contextText
                ? `[Visual Evidence from Page ${pageNum}]: ${contextText}\n\n${visualDescription}`
                : `[Visual Evidence from Page ${pageNum}]: ${visualDescription}`;
              // IMPORTANT: create the DB record FIRST, push the chunk AFTER.
              if (!permanentImageUrl) logger.warn(`Cloudinary upload failed for p${pageNum} full-page render, using dynamic URL fallback`);
              await prisma.documentImage.create({
                data: {
                  documentId,
                  pageNumber: pageNum,
                  filePath: permanentImageUrl || dynamicImageUrl,
                  description: visualDescription,
                  contextText: contextText || null,
                  altText: `Figure on page ${pageNum}`
                }
              });
              chunks.push({
                pageNumber: pageNum,
                text: embeddingText,
                chunkIndex: 999 + pageNum
              });
            }
            break;
          } catch (vErr: any) {
            logger.warn(`Vision analysis failed for p${pageNum}: ${vErr}`);
            retries--;
            if (retries > 0) await new Promise(res => setTimeout(res, 2000));
          }
        }
        await new Promise(res => setTimeout(res, 500));
      }

      if (fullPageText.length === 0) continue;

      // Collect raw page text for semantic chunking after all pages are processed
      pageTexts.push({ pageNumber: pageNum, text: fullPageText });

      // Persist raw page text for future rechunking without re-fetching the PDF
      await prisma.documentPage.upsert({
        where: { documentId_pageNumber: { documentId, pageNumber: pageNum } },
        create: { documentId, pageNumber: pageNum, rawText: fullPageText, wordCount: fullPageText.split(/\s+/).length, isOcr: false },
        update: { rawText: fullPageText },
      });

      // Progress from 10% to 40% based on pages
      const extractionProgress = Math.floor(10 + (pageNum / pageCount) * 30);
      await prisma.document.update({
        where: { id: documentId },
        data: { progress: extractionProgress },
      });
    }

    // Build semantic text chunks from all collected page text, then merge with visual chunks
    const textChunks = buildSemanticChunks(pageTexts);
    for (const tc of textChunks) chunks.push(tc);

    if (chunks.length === 0) {
      throw new Error('No valid text could be extracted from this PDF');
    }

    logger.info(`Extracted ${textChunks.length} semantic text chunks + ${chunks.length - textChunks.length} visual chunks. Generating embeddings...`);

    // Process in batches of 100 to avoid OpenAI rate limits
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const texts = batchChunks.map(c => c.text);

      // Get embeddings — OpenAI primary, Gemini REST fallback on quota exhaustion
      const embeddingVectors = await embedTexts(texts);

      const vectorsToUpsert = [];
      const chunkRecords = [];
      const chunkEmbeddings: { idx: number; vector: number[] }[] = [];
      
      for (let idx = 0; idx < batchChunks.length; idx++) {
        const chunk = batchChunks[idx];
        const pineconeVectorId = `doc_${documentId}_p${chunk.pageNumber}_c${chunk.chunkIndex}_${crypto.randomUUID()}`;
        
        vectorsToUpsert.push({
          id: pineconeVectorId,
          values: embeddingVectors[idx],
          metadata: {
            documentId,
            pageNumber: chunk.pageNumber,
            text: chunk.text,
            type: chunk.chunkIndex >= 999 ? 'visual' : 'text'
          },
        });

        chunkRecords.push({
          documentId,
          content: chunk.text,
          pageNumber: chunk.pageNumber,
          chunkIndex: chunk.chunkIndex,
          pineconeVectorId: pineconeVectorId,
          tokenCount: Math.ceil(chunk.text.length / 4),
        });

        chunkEmbeddings.push({ idx, vector: embeddingVectors[idx] });

        // CRITICAL: If this is a visual chunk, update the corresponding documentImage record with the vector ID
        if (chunk.chunkIndex >= 999) {
          await prisma.documentImage.updateMany({
            where: { 
              documentId, 
              pageNumber: chunk.pageNumber,
              pineconeVectorId: null // only update the one we just created
            },
            data: { pineconeVectorId: pineconeVectorId }
          });
        }
      }

      await pineconeIndex.upsert(vectorsToUpsert);
      await prisma.documentChunk.createMany({ data: chunkRecords });

      // Store embeddings in pgvector for each newly created chunk
      for (const { idx, vector } of chunkEmbeddings) {
        const rec = chunkRecords[idx];
        await prisma.$executeRaw`
          UPDATE document_chunks
          SET embedding = ${JSON.stringify(vector)}::vector
          WHERE document_id = ${documentId}::uuid
            AND page_number = ${rec.pageNumber}
            AND chunk_index = ${rec.chunkIndex}
            AND pinecone_vector_id = ${rec.pineconeVectorId}
        `;
      }

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
