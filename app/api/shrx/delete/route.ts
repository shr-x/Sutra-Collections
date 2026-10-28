import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { previewDelete, executeDelete, DeleteBlockedError } from '@/lib/shrx/delete';
import { requireShrx, shrxAudit } from '@/lib/shrx/session';
import { StockVariantError } from '@/lib/stock-variant';

const Kind = z.enum(['invoice', 'tailoring_order']);

// Preview: what would be deleted and undone, and anything blocking it.
export async function GET(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const kind = Kind.safeParse(req.nextUrl.searchParams.get('kind'));
  const number = req.nextUrl.searchParams.get('number')?.trim() ?? '';
  if (!kind.success || !number) return NextResponse.json({ error: 'kind and number are required' }, { status: 400 });
  const plan = await previewDelete(kind.data, number);
  if (!plan) return NextResponse.json({ error: `${number} not found` }, { status: 404 });
  return NextResponse.json({ plan });
}

const Body = z.object({ kind: Kind, number: z.string().trim().min(1), confirm: z.string() });

export async function POST(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'kind, number and confirm are required' }, { status: 400 });
  const { kind, number, confirm } = parsed.data;
  try {
    const plan = await executeDelete(kind, number, confirm);
    await shrxAudit(`delete.${kind}`, number, plan as unknown as Record<string, unknown>, g.ip);
    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    if (err instanceof DeleteBlockedError || err instanceof StockVariantError) {
      await shrxAudit(`delete.${kind}.refused`, number, { reason: err.message }, g.ip);
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('[shrx delete]', err);
    await shrxAudit(`delete.${kind}.error`, number, { error: (err as Error).message }, g.ip);
    return NextResponse.json({ error: 'Delete failed — nothing was changed.' }, { status: 500 });
  }
}
