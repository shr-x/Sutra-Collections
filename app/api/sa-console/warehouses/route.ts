import { NextResponse } from 'next/server';
import { getSASession } from '@/lib/sa-auth';
import { query } from '@/lib/db';

export async function GET() {
  const sa = await getSASession();
  if (!sa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await query<{ id: string; name: string }>(
    'SELECT id, name FROM warehouses WHERE is_active = TRUE ORDER BY name'
  );

  return NextResponse.json({ warehouses: res.rows });
}
