import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';

const VALID_STATUS = ['present', 'absent', 'half_day', 'leave'] as const;
type AttendanceStatus = (typeof VALID_STATUS)[number];

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('admin');
    const { userId, date, status } = await req.json() as {
      userId: string; date: string; status: AttendanceStatus;
    };

    if (!VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (session.role === 'staff' && userId !== session.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await pool.query(
      `INSERT INTO attendance (user_id, date, status, marked_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, date)
       DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by`,
      [userId, date, status, session.userId]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRole('admin');
    const { userId, date } = await req.json() as { userId: string; date: string };

    if (session.role === 'staff' && userId !== session.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await pool.query('DELETE FROM attendance WHERE user_id=$1 AND date=$2', [userId, date]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
