import { NextRequest, NextResponse } from 'next/server';
import { runDailyReminders } from '@/lib/reminders';
import { runDailyGreetings } from '@/lib/greetings';
import { runLowStockAlerts } from '@/lib/low-stock';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [reminders, greetings, lowStock] = await Promise.allSettled([
    runDailyReminders(),
    runDailyGreetings(),
    runLowStockAlerts(),
  ]);

  return NextResponse.json({
    reminders: reminders.status === 'fulfilled' ? reminders.value : { error: String(reminders.reason) },
    greetings: greetings.status === 'fulfilled' ? greetings.value : { error: String(greetings.reason) },
    lowStock:  lowStock.status  === 'fulfilled' ? lowStock.value  : { error: String(lowStock.reason) },
  });
}
