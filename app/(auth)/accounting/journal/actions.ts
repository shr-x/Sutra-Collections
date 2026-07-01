'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { postJournalEntry } from '@/lib/accounting';
import { logAudit } from '@/lib/audit';
import type { ActionResult } from '@/types';

const LineSchema = z.object({
  accountCode: z.string().min(1),
  debit: z.coerce.number().nonnegative(),
  credit: z.coerce.number().nonnegative(),
});

const JournalSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  description: z.string().min(1).max(500),
  lines: z.array(LineSchema).min(2),
});

export async function createJournalEntryAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole('accountant', 'admin');

  let parsed: z.infer<typeof JournalSchema>;
  try {
    const raw = JSON.parse(formData.get('payload') as string);
    parsed = JournalSchema.parse(raw);
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Invalid data' };
  }

  const totalDebit  = parsed.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = parsed.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return { success: false, error: `Entry doesn't balance: debits ${totalDebit.toFixed(2)} ≠ credits ${totalCredit.toFixed(2)}` };
  }

  let entryId: string;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      entryId = await postJournalEntry({
        entryDate: parsed.entryDate,
        description: parsed.description,
        isManual: true,
        createdBy: session.userId,
        lines: parsed.lines,
      }, client);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to post journal entry' };
  }

  logAudit({ userId: session.userId, action: 'create', entityType: 'expense', entityId: entryId!, entityLabel: parsed.description }).catch(() => {});
  redirect(`/accounting/journal/${entryId}`);
}
