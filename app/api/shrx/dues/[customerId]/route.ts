import { NextRequest, NextResponse } from 'next/server';
import { customerDues } from '@/lib/shrx/dues';
import { requireShrx } from '@/lib/shrx/session';

export async function GET(req: NextRequest, { params }: { params: { customerId: string } }) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  return NextResponse.json(await customerDues(params.customerId));
}
