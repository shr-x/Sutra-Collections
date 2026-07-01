import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import type { Role } from '@/types';

export const metadata: Metadata = { title: 'Reports' };

const ALL_REPORTS = [
  {
    href:        '/reports/daybook',
    label:       'Daybook',
    description: 'All transactions for a single date — sales, purchases, expenses with running total.',
    icon:        '📅',
    roles:       ['admin', 'staff', 'accountant'] as Role[],
  },
  {
    href:        '/reports/sales',
    label:       'Sales Report',
    description: 'Sales by date range with GST breakdown, daily trend chart and CSV export.',
    icon:        '📈',
    roles:       ['admin', 'staff', 'accountant'] as Role[],
  },
  {
    href:        '/reports/purchases',
    label:       'Purchase Report',
    description: 'Purchases by date range, supplier-wise breakdown and ITC claimable.',
    icon:        '🛒',
    roles:       ['admin', 'accountant'] as Role[],
  },
  {
    href:        '/reports/best-sellers',
    label:       'Best Sellers',
    description: 'Top items by quantity sold or revenue in any date range.',
    icon:        '🏆',
    roles:       ['admin', 'staff', 'accountant'] as Role[],
  },
  {
    href:        '/reports/staff',
    label:       'Staff Performance',
    description: 'Per-staff invoice count, total sales and collections for a period.',
    icon:        '👤',
    roles:       ['admin'] as Role[],
  },
  {
    href:        '/reports/audit',
    label:       'Audit Log',
    description: 'Every create / update / delete action — who did it, when, and what changed.',
    icon:        '🔍',
    roles:       ['admin'] as Role[],
  },
  {
    href:        '/reports/export',
    label:       'Export Data',
    description: 'Download customers, suppliers, items, invoices and tailoring orders as CSV.',
    icon:        '⬇️',
    roles:       ['admin', 'staff', 'accountant'] as Role[],
  },
];

export default async function ReportsIndexPage() {
  const session = await requireRole('admin', 'accountant');
  const role    = session.role as Role;

  const settingsRes = await query<{ staff_module_enabled: boolean }>(
    'SELECT staff_module_enabled FROM settings LIMIT 1'
  ).catch(() => ({ rows: [{ staff_module_enabled: false }] }));
  const staffEnabled = settingsRes.rows[0]?.staff_module_enabled ?? false;

  const available = ALL_REPORTS.filter((r) => r.roles.includes(role));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((r) => {
          const isStaffCard = r.href === '/reports/staff';
          const disabled = isStaffCard && !staffEnabled;

          if (disabled) {
            return (
              <div
                key={r.href}
                className="card flex flex-col gap-3 opacity-50 cursor-not-allowed select-none"
                title="Staff module is disabled. Enable it in Settings → Modules."
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl grayscale">{r.icon}</span>
                  <h2 className="font-semibold text-gray-400">{r.label}</h2>
                </div>
                <p className="text-sm text-gray-400 flex-1">{r.description}</p>
                <span className="text-xs text-gray-400">Disabled — enable in Settings</span>
              </div>
            );
          }

          return (
            <Link
              key={r.href}
              href={r.href}
              className="card flex flex-col gap-3 hover:ring-2 hover:ring-purple-500 transition-all group"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{r.icon}</span>
                <h2 className="font-semibold text-gray-900 group-hover:text-purple-700">{r.label}</h2>
              </div>
              <p className="text-sm text-gray-500 flex-1">{r.description}</p>
              <span className="text-xs text-purple-600 group-hover:underline">Open →</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
