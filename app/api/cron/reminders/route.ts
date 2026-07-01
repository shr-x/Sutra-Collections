import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { runDailyReminders } from '@/lib/reminders';

/**
 * Manual trigger for the daily reminder job.
 * Accessible via GET /api/cron/reminders (admin only).
 * Also called by "Run Now" button on /settings/reminders.
 */
export async function GET() {
  await requireRole('admin');

  try {
    const result = await runDailyReminders();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron/reminders] Error:', err);
    return NextResponse.json({ error: 'Reminder job failed' }, { status: 500 });
  }
}
