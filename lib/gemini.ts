import zlib from 'zlib';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

// Flash-lite endpoint used by the purchase AI importer
const GEMINI_FLASH_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

type TextPart = { text: string };
type BlobPart = { inline_data: { mime_type: string; data: string } };
export type GeminiPart = TextPart | BlobPart;

const EXCEL_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch {}

  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }

  // Extract first JSON array or object found in text
  const found = text.match(/(\[[\s\S]+?\]|\{[\s\S]+?\})/);
  if (found) { try { return JSON.parse(found[1]); } catch {} }

  throw new Error(`Gemini returned non-JSON: ${text.slice(0, 300)}`);
}

export async function callGeminiJson(parts: GeminiPart[]): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in environment variables');

  const resp = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`Gemini: ${data.error.message}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');

  return extractJson(text);
}

/**
 * Send a system prompt + arbitrary parts (text and/or inline files) to Gemini
 * (gemini-3.1-flash-lite) and parse the reply as JSON. Used by the purchase AI importer.
 */
export async function callGeminiPartsJson(systemPrompt: string, parts: GeminiPart[]): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in environment variables');

  const resp = await fetch(`${GEMINI_FLASH_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`Gemini: ${data.error.message}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');

  return extractJson(text);
}

/**
 * Send a system prompt + plain user text to Gemini and parse JSON.
 */
export async function callGeminiTextJson(systemPrompt: string, userText: string): Promise<unknown> {
  return callGeminiPartsJson(systemPrompt, [{ text: userText }]);
}

async function excelToText(buf: Buffer): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  return wb.SheetNames.map((sh) => {
    return `[Sheet: ${sh}]\n${XLSX.utils.sheet_to_csv(wb.Sheets[sh])}`;
  }).join('\n\n');
}

/**
 * Extract plain text from a .docx (Office Open XML) buffer without external deps.
 * A .docx is a ZIP archive; we locate word/document.xml, inflate it, and strip
 * tags. Returns '' if extraction fails (caller can fall back to base64).
 */
function docxToText(buf: Buffer): string {
  try {
    const LOCAL_SIG = 0x04034b50;
    let i = 0;
    while (i + 30 <= buf.length && buf.readUInt32LE(i) === LOCAL_SIG) {
      const method   = buf.readUInt16LE(i + 8);
      const compSize = buf.readUInt32LE(i + 18);
      const nameLen  = buf.readUInt16LE(i + 26);
      const extraLen = buf.readUInt16LE(i + 28);
      const name     = buf.toString('utf8', i + 30, i + 30 + nameLen);
      const dataStart = i + 30 + nameLen + extraLen;
      if (name === 'word/document.xml') {
        const raw = buf.subarray(dataStart, dataStart + compSize);
        const xml = method === 8 ? zlib.inflateRawSync(raw).toString('utf8')
                  : method === 0 ? raw.toString('utf8')
                  : '';
        return xml
          .replace(/<\/w:p>/g, '\n')          // paragraph breaks
          .replace(/<[^>]+>/g, '')             // strip remaining tags
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
      i = dataStart + compSize;
    }
  } catch { /* fall through to '' */ }
  return '';
}

export async function fileToParts(file: File): Promise<GeminiPart[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type ?? '';
  const name = file.name.toLowerCase();

  if (mime === 'text/csv' || mime === 'text/plain' || name.endsWith('.csv')) {
    return [{ text: buf.toString('utf-8') }];
  }

  if (EXCEL_MIME.has(mime) || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return [{ text: await excelToText(buf) }];
  }

  // Word .docx — extract text from the OOXML zip (no external dependency)
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const text = docxToText(buf);
    if (text) return [{ text }];
    // Extraction failed → fall through to base64 so Gemini can still attempt it
  }

  // PDF or image — send as base64
  const resolvedMime =
    mime ||
    (name.endsWith('.pdf')                           ? 'application/pdf' :
     name.endsWith('.png')                           ? 'image/png'       :
     name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg'      :
                                                       'application/octet-stream');

  return [{ inline_data: { mime_type: resolvedMime, data: buf.toString('base64') } }];
}
