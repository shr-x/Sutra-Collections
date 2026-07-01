import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { callGeminiJson, fileToParts } from '@/lib/gemini';

const PROMPT = `You are extracting customer records for an Indian clothing shop ERP.
From the provided file or image, extract every customer and return a JSON array.
Each element must have ONLY these exact keys:
  "name"         – customer name (string, required)
  "phone"        – phone or mobile number (string, use "" if not found)
  "gstin"        – GST number (string, use "" if not found)
  "address"      – full address (string, use "" if not found)
  "credit_limit" – credit limit in rupees (number, default 0)
Return ONLY a valid JSON array with no markdown fences or explanation.
Example: [{"name":"Rahul Sharma","phone":"9876543210","gstin":"","address":"MG Road, Bangalore","credit_limit":5000}]`;

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
      name:         String(r.name         ?? ''),
      phone:        String(r.phone        ?? ''),
      gstin:        String(r.gstin        ?? ''),
      address:      String(r.address      ?? ''),
      credit_limit: String(r.credit_limit ?? '0'),
    }));

    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
