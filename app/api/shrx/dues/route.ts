import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchCustomers, clearCustomerDues } from '@/lib/shrx/dues';
import { requireShrx, shrxAudit, shrxActingUserId } from '@/lib/shrx/session';

export async function GET(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ customers: [] });
  return NextResponse.json({ customers: await searchCustomers(q) });
}

const Body = z.object({
  customerId: z.string().uuid(),
  invoiceIds: z.union([z.literal('all'), z.array(z.string().uuid()).min(1)]),
});

// Silent clear — never sends WhatsApp (see lib/shrx/dues.ts).
export async function POST(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'customerId and invoiceIds are required' }, { status: 400 });
  const cleared = await clearCustomerDues(parsed.data.customerId, parsed.data.invoiceIds, await shrxActingUserId());
  await shrxAudit('dues.clear', parsed.data.customerId, { cleared }, g.ip);
  return NextResponse.json({ ok: true, cleared });
}
