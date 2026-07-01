import { pool } from '@/lib/db';

export type AuditAction = 'create' | 'update' | 'delete' | 'stage_change' | 'payment';
export type AuditEntity =
  | 'invoice' | 'quotation' | 'credit_note' | 'debit_note' | 'purchase'
  | 'customer' | 'supplier' | 'item' | 'expense'
  | 'tailoring_order' | 'design' | 'user' | 'setting';

export async function logAudit({
  userId,
  action,
  entityType,
  entityId,
  entityLabel,
  oldValue,
  newValue,
}: {
  userId: string;
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string;
  entityLabel?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
}): Promise<void> {
  // Audit log failures must never break the calling flow
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, old_value, new_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        userId,
        action,
        entityType,
        entityId,
        entityLabel ?? null,
        oldValue  ? JSON.stringify(oldValue)  : null,
        newValue  ? JSON.stringify(newValue)  : null,
      ]
    );
  } catch (err) {
    console.error('[audit]', err);
  }
}
