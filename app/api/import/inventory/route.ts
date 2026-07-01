import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { callGeminiJson, fileToParts } from '@/lib/gemini';

const PROMPT = `You are extracting inventory data for an Indian clothing shop ERP system.
From the provided file or image, extract every inventory item and return a JSON array.
Each element must have ONLY these exact keys:
  "name"      – item/product name (string, required)
  "category"  – product category, e.g. "Shirts", "Sarees" (string, use "" if not found)
  "hsn_code"  – HSN code, min 4 digits (string, use "" if not found)
  "gst_rate"  – one of 0, 5, 12, 18, 28 (number, default 12 for clothing)
  "unit"      – unit of measure: "pcs", "meters", "kg", "pairs", "sets", etc. (default "pcs")
  "sizes"     – comma-separated sizes if mentioned, e.g. "S, M, L" (string, "" if none)
  "colors"    – comma-separated colours if mentioned, e.g. "Red, Blue" (string, "" if none)
Return ONLY a valid JSON array with no markdown fences or explanation.
Example: [{"name":"Cotton Shirt","category":"Shirts","hsn_code":"6205","gst_rate":12,"unit":"pcs","sizes":"S, M, L","colors":"White, Blue"}]`;

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const parts = await fileToParts(file);
    const raw = await callGeminiJson([{ text: PROMPT }, ...parts]);
    if (!Array.isArray(raw)) throw new Error('Gemini did not return a JSON array');

    const rows = (raw as Record<string, unknown>[]).map((r) => ({
      name:     String(r.name     ?? ''),
      category: String(r.category ?? ''),
      hsn_code: String(r.hsn_code ?? ''),
      gst_rate: String(r.gst_rate ?? '12'),
      unit:     String(r.unit     ?? 'pcs'),
      sizes:    String(r.sizes    ?? ''),
      colors:   String(r.colors   ?? ''),
    }));

    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
