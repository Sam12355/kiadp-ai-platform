import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const OPS = (pdfjs as any).OPS;

async function main() {
  const p = new PrismaClient();
  const doc = await p.document.findFirst({ select: { filePath: true, title: true } });
  if (!doc?.filePath) { console.log('No doc found'); process.exit(1); }
  console.log('Doc:', doc.title);

  const data = fs.readFileSync(doc.filePath);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;

  for (const pn of [5, 9, 12, 14, 22, 31]) {
    const page = await pdf.getPage(pn);
    const ops = await page.getOperatorList();
    
    const xobjectIdxs: number[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === OPS.paintImageXObject) xobjectIdxs.push(i);
    }
    
    const hasKeywords = /figure|table|chart/i.test(
      (await page.getTextContent()).items.map((x: any) => x.str).join(' ')
    );
    
    console.log(`\nPage ${pn}: ${xobjectIdxs.length} XObject images, keywords=${hasKeywords}`);
    
    for (const idx of xobjectIdxs) {
      const imgName = ops.argsArray[idx][0];
      try {
        const imgData: any = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
          page.objs.get(imgName, (data: any) => { clearTimeout(timeout); resolve(data); });
        });
        console.log(`  ${imgName}: ${imgData.width}x${imgData.height}, kind=${imgData.kind}, data=${imgData.data?.length ?? 'none'} bytes`);
      } catch(e: any) { console.log(`  ${imgName}: ${e.message}`); }
    }
  }
  process.exit(0);
}
main();
