import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  try {
    await requireRole('admin', 'staff');
    const { rows } = await query<{
      id: string; name: string; phone: string | null; specialty: string | null;
    }>(
      `SELECT id, name, phone, specialty
       FROM tailors
       WHERE is_active = TRUE
       ORDER BY name`
    );
    return NextResponse.json({ tailors: rows });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
