import { pool } from '@/lib/db';

/**
 * Activate/deactivate a user. Users are never hard-deleted (invoices, journal
 * entries, payments… reference users.id). Refuses to deactivate the last
 * active admin; the admin rows are locked first so two concurrent
 * deactivations can't both pass the check.
 */
export async function setUserActive(
  userId: string,
  active: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admins = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE role='admin' AND is_active=TRUE FOR UPDATE`
    );
    const target = await client.query<{ role: string; is_active: boolean }>(
      'SELECT role, is_active FROM users WHERE id=$1 FOR UPDATE', [userId]
    );
    if (!target.rows[0]) { await client.query('ROLLBACK'); return { ok: false, error: 'User not found.' }; }
    if (!active && target.rows[0].role === 'admin' && target.rows[0].is_active
        && admins.rows.length <= 1) {
      await client.query('ROLLBACK');
      return { ok: false, error: "Can't deactivate the last active admin." };
    }
    await client.query('UPDATE users SET is_active=$1 WHERE id=$2', [active, userId]);
    // End their open sessions too (getSession also rejects inactive users).
    if (!active) await client.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
