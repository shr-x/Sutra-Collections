import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import JournalForm from '../journal-form';
import JournalHowToUse from './journal-how-to-use';

export const metadata: Metadata = { title: 'New Journal Entry' };

export default async function NewJournalEntryPage() {
  await requireRole('accountant', 'admin');

  const res = await pool.query<{ id: string; account_code: string; account_name: string }>(
    `SELECT id, account_code, account_name FROM accounts WHERE is_active = TRUE ORDER BY account_code`
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">New Journal Entry</h1>
          <p className="text-sm text-gray-500">Post a manual double-entry journal entry.</p>
        </div>
      </div>
      <JournalForm accounts={res.rows} />
      <JournalHowToUse />
    </div>
  );
}
