import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { callGeminiTextJson, callGeminiPartsJson, fileToParts } from '@/lib/gemini';

const SYSTEM_PROMPT = `Extract purchase invoice data from this document/text. Return ONLY a JSON object with these keys:
- supplier_name: string (the supplier/vendor name)
- supplier_gstin: string or null (the supplier's 15-character GST number, if present)
- invoice_number: string or null (the supplier's bill/invoice number)
- date: string in YYYY-MM-DD format or null
- items: array of { name: string, quantity: number, rate: number, gst_rate: number, hsn_code: string|null, size: string|null, color: string|null }
- notes: string or null
Rules: rate is the per-unit price as a number. gst_rate must be one of 0, 5, 12, 18, 28. Extract size and color only if explicitly mentioned for an item (else null). Do not include any commentary — output JSON only.`;

function norm(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface ExtractedItem {
  name?: unknown; quantity?: unknown; rate?: unknown; gst_rate?: unknown; hsn_code?: unknown;
  size?: unknown; color?: unknown;
}
interface Extracted {
  supplier_name?: unknown; supplier_gstin?: unknown; invoice_number?: unknown; date?: unknown;
  items?: unknown; notes?: unknown;
}

export async function POST(req: NextRequest) {
  await requireRole('admin');

  // Accept either an uploaded file (multipart) or pasted text (JSON) (#1)
  const contentType = req.headers.get('content-type') ?? '';
  let parsed: Extracted;
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: 'Please choose a file to upload.' }, { status: 400 });
      }
      const parts = await fileToParts(file);
      parsed = (await callGeminiPartsJson(SYSTEM_PROMPT, parts)) as Extracted;
    } else {
      const body = (await req.json().catch(() => ({}))) as { text?: string };
      const text = (body.text ?? '').trim();
      if (text.length < 5) {
        return NextResponse.json({ error: 'Paste some invoice text first.' }, { status: 400 });
      }
      parsed = (await callGeminiTextJson(SYSTEM_PROMPT, text)) as Extracted;
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // ── Match supplier: GSTIN first, then fuzzy name (#2) ───────────────────────
  const supRes = await query<{ id: string; name: string; gstin: string | null }>(
    'SELECT id, name, gstin FROM suppliers'
  );
  const supName = String(parsed.supplier_name ?? '').trim();
  const supGstin = String(parsed.supplier_gstin ?? '').trim().toUpperCase();
  let matchedSup: { id: string; name: string; gstin: string | null } | null = null;
  let matchedBy: 'gstin' | 'name' | null = null;

  // 1) Exact GSTIN match (case-insensitive)
  if (supGstin) {
    matchedSup = supRes.rows.find((s) => (s.gstin ?? '').trim().toUpperCase() === supGstin) ?? null;
    if (matchedSup) matchedBy = 'gstin';
  }
  // 2) Fall back to fuzzy name match
  if (!matchedSup && supName) {
    const t = norm(supName);
    matchedSup =
      supRes.rows.find((s) => norm(s.name) === t) ??
      supRes.rows.find((s) => t.length > 2 && (norm(s.name).includes(t) || t.includes(norm(s.name)))) ??
      null;
    if (matchedSup) matchedBy = 'name';
  }

  // ── Fuzzy-match items against the catalogue ─────────────────────────────────
  const itemRes = await query<{ id: string; name: string; gst_rate: string; hsn_code: string | null }>(
    'SELECT id, name, gst_rate, hsn_code FROM items WHERE is_active = TRUE'
  );
  const rawItems = Array.isArray(parsed.items) ? (parsed.items as ExtractedItem[]) : [];
  const items = rawItems.map((it) => {
    const name = String(it.name ?? '').trim();
    const t = norm(name);
    const match =
      itemRes.rows.find((d) => norm(d.name) === t) ??
      itemRes.rows.find((d) => t.length > 2 && (norm(d.name).includes(t) || t.includes(norm(d.name)))) ??
      null;
    return {
      name,
      item_id: match?.id ?? null,
      matched: !!match,
      quantity: Number(it.quantity) || 1,
      rate: Number(it.rate) || 0,
      gst_rate: Number(it.gst_rate) || (match ? Number(match.gst_rate) : 0),
      hsn_code: (it.hsn_code as string | null) ?? match?.hsn_code ?? null,
      size: it.size ? String(it.size).trim() : null,
      color: it.color ? String(it.color).trim() : null,
    };
  });

  return NextResponse.json({
    supplier: {
      id: matchedSup?.id ?? null,
      name: supName,
      gstin: supGstin || null,
      matched: !!matchedSup,
      matched_by: matchedBy,
    },
    invoice_number: parsed.invoice_number ? String(parsed.invoice_number) : null,
    date: parsed.date ? String(parsed.date) : null,
    notes: parsed.notes ? String(parsed.notes) : null,
    items,
  });
}
