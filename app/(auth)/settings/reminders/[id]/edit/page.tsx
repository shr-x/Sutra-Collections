import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import ReminderForm from '../../reminder-form';
import { updateReminderAction } from '../../actions';

export const metadata: Metadata = { title: 'Edit Reminder Setting' };

export default async function EditReminderPage({ params }: { params: { id: string } }) {
  await requireRole('admin');
  const res = await pool.query(`SELECT * FROM reminder_settings WHERE id=$1`, [params.id]);
  if (!res.rows[0]) notFound();
  const r = res.rows[0];
  const boundAction = updateReminderAction.bind(null, params.id);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Edit Reminder — {r.day_threshold} Days</h1>
      </div>
      <ReminderForm action={boundAction} defaultValues={r} />
    </div>
  );
}
