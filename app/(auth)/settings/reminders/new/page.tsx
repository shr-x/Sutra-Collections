import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import ReminderForm from '../reminder-form';
import { createReminderAction } from '../actions';

export const metadata: Metadata = { title: 'New Reminder Setting' };

export default async function NewReminderPage() {
  await requireRole('admin');
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">New Reminder Threshold</h1>
      </div>
      <ReminderForm action={createReminderAction} />
    </div>
  );
}
