import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { runDailyGreetings } from '@/lib/greetings';

export async function GET() {
  await requireRole('admin');

  try {
    const result = await runDailyGreetings();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron/greetings] Error:', err);
    return NextResponse.json({ error: 'Greeting job failed' }, { status: 500 });
  }
}
