import { query } from '@/lib/db';

/**
 * Records an error from a best-effort path that deliberately doesn't fail the
 * user's action (payment ↔ invoice sync, tailoring invoice create/amend, …).
 * Shown in SHRX → Failed updates. Never throws: a logging failure must not
 * turn a swallowed error into a visible one.
 */
export async function logAppError(
  context: string,
  err: unknown,
  entity?: { type: string; id?: string | null },
  details?: Record<string, unknown>
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await query(
      `INSERT INTO app_error_log (context, entity_type, entity_id, message, details)
       VALUES ($1,$2,$3,$4,$5)`,
      [context, entity?.type ?? null, entity?.id ?? null, message.slice(0, 2000),
       details ? JSON.stringify(details) : null]
    );
  } catch (logErr) {
    console.error('[app-error-log] could not record error:', logErr, 'original:', message);
  }
}
