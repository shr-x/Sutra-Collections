/**
 * Next.js instrumentation hook — runs once on server startup.
 * Sets up the daily WhatsApp reminder cron job at 09:00 local time.
 */
export async function register() {
  // Only run in Node.js runtime (not Edge), and only in production or when explicitly enabled
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'test') return;

  try {
    const cron = await import('node-cron');
    const { runDailyReminders } = await import('./lib/reminders');

    // Daily at 09:00 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('[reminders] Running daily reminder job…');
      const result = await runDailyReminders().catch((err) => {
        console.error('[reminders] Job failed:', err);
        return null;
      });
      if (result) {
        console.log(`[reminders] Done — checked: ${result.checked}, sent: ${result.sent}, skipped: ${result.skipped}, failed: ${result.failed}`);
        if (result.errors.length > 0) console.error('[reminders] Errors:', result.errors);
      }
    });

    console.log('[reminders] Daily cron scheduled (09:00 daily)');
  } catch (err) {
    console.error('[reminders] Failed to schedule cron:', err);
  }
}
