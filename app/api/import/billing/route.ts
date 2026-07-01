import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { callGeminiJson, fileToParts } from '@/lib/gemini';

const PROMPT = `You are extracting invoice data from a bill or invoice for an Indian clothing shop ERP.
From the provided file or image, extract the invoice details and return a JSON object.
The object must have ONLY these exact keys:
  "type"         – "purchase" if this is a supplier bill/purchase invoice, "sales" if this is a sales invoice to a customer (default "purchase")
  "party_name"   – supplier name (for purchase) or customer name (for sales) (string, "" if not found)
  "invoice_date" – invoice date in YYYY-MM-DD format (string, use today's date if not found)
  "items"        – array of line items, each with:
    "name"     – product/item name (string, required)
    "quantity" – quantity (number, default 1)
    "rate"     – unit price in rupees excluding GST (number, required)
    "gst_rate" – GST rate: 0, 5, 12, 18, or 28 (number, default 12)
Return ONLY a valid JSON object with no markdown fences or explanation.
Example: {"type":"purchase","party_name":"Textile World","invoice_date":"2026-06-22","items":[{"name":"Cotton Fabric","quantity":50,"rate":120,"gst_rate":5}]}`;

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin', 'staff');

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const parts = await fileToParts(file);
    const raw = await callGeminiJson([{ text: PROMPT }, ...parts]) as Record<string, unknown>;

    if (Array.isArray(raw) || typeof raw !== 'object') {
      throw new Error('Gemini did not return a JSON object');
    }

    const rawItems = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];

    const result = {
      type:         raw.type === 'sales' ? 'sales' : 'purchase',
      party_name:   String(raw.party_name   ?? ''),
      invoice_date: String(raw.invoice_date ?? new Date().toISOString().slice(0, 10)),
      items: rawItems.map((it) => ({
        name:     String(it.name     ?? ''),
        quantity: String(it.quantity ?? '1'),
        rate:     String(it.rate     ?? '0'),
        gst_rate: String(it.gst_rate ?? '12'),
      })),
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
