import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import ConfirmForm from '@/components/confirm-form';
import { toggleReminderAction, deleteReminderAction } from './actions';

export const metadata: Metadata = { title: 'Reminder Settings' };

interface ReminderSetting {
  id: string;
  day_threshold: number;
  tone: string;
  message_template: string;
  is_active: boolean;
  created_at: string;
}

const TONE_BADGE: Record<string, string> = {
  gentle: 'bg-green-100 text-green-700',
  firm:   'bg-yellow-100 text-yellow-700',
  final:  'bg-red-100 text-red-700',
};

export default async function RemindersPage() {
  await requireRole('admin');

  const res = await pool.query<ReminderSetting>(
    `SELECT * FROM reminder_settings ORDER BY day_threshold`
  );

  const logsRes = await pool.query<{ total: string; sent: string; failed: string }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent,
            SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
     FROM reminder_logs`
  );
  const logs = logsRes.rows[0];

  return (
    <div>
      <div className="mb-4">
        <Link href="/settings" className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1">
          ← Back to Settings
        </Link>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title">WhatsApp Reminder Settings</h1>
          <p className="text-sm text-gray-500">Configure escalating reminders sent daily at 09:00.</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/cron/reminders" className="btn-secondary text-sm">Run Now</a>
          <Link href="/settings/reminders/new" className="btn-primary">+ Add Threshold</Link>
        </div>
      </div>

      {/* Log summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card py-3">
          <p className="text-xs text-gray-500">Total Reminders Sent</p>
          <p className="text-xl font-bold text-gray-800">{logs?.total ?? 0}</p>
        </div>
        <div className="card py-3 bg-green-50 border-green-200">
          <p className="text-xs text-green-600">Delivered</p>
          <p className="text-xl font-bold text-green-700">{logs?.sent ?? 0}</p>
        </div>
        <div className="card py-3 bg-red-50 border-red-200">
          <p className="text-xs text-red-600">Failed</p>
          <p className="text-xl font-bold text-red-700">{logs?.failed ?? 0}</p>
        </div>
      </div>

      {/* Settings table */}
      <div className="card p-0 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Days Overdue</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Message Preview</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Active</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {res.rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No reminder thresholds configured.</td></tr>
            )}
            {res.rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-bold text-gray-800">{row.day_threshold} days</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TONE_BADGE[row.tone] ?? ''}`}>
                    {row.tone}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">
                  {row.message_template.slice(0, 80)}…
                </td>
                <td className="px-4 py-3 text-center">
                  <form action={toggleReminderAction.bind(null, row.id)}>
                    <button type="submit" title={row.is_active ? 'Click to deactivate' : 'Click to activate'}
                      className={`text-lg ${row.is_active ? 'text-green-500' : 'text-gray-300'}`}>
                      {row.is_active ? '●' : '○'}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/settings/reminders/${row.id}/edit`}
                      className="text-xs text-purple-600 hover:underline">Edit</Link>
                    <ConfirmForm action={deleteReminderAction.bind(null, row.id)}
                      message="Delete this reminder setting?">
                      <button type="submit" className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    </ConfirmForm>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">How it works</h3>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li>Runs automatically every day at 09:00 AM</li>
          <li>Finds all unpaid invoices where the due date has passed</li>
          <li>Sends a WhatsApp message to the customer matching the highest threshold reached</li>
          <li>Each threshold is sent only once per invoice (no duplicates)</li>
          <li>Customers who have opted out of WhatsApp are skipped</li>
          <li>Requires <code className="bg-blue-100 px-1 rounded">WHATSAPP_ACCESS_TOKEN</code> and <code className="bg-blue-100 px-1 rounded">WHATSAPP_PHONE_NUMBER_ID</code> env vars</li>
        </ul>
      </div>
    </div>
  );
}
