import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';

export const metadata: Metadata = { title: 'Data Export' };

const EXPORTS = [
  {
    type:        'customers',
    label:       'Customers',
    description: 'All customers with phone, address, credit limit, loyalty points',
    icon:        '👥',
    adminOnly:   false,
  },
  {
    type:        'suppliers',
    label:       'Suppliers',
    description: 'All suppliers with contact details and GSTIN',
    icon:        '🏭',
    adminOnly:   false,
  },
  {
    type:        'items',
    label:       'Items / Products',
    description: 'Inventory items with HSN code, GST rate, category and stock',
    icon:        '📦',
    adminOnly:   false,
  },
  {
    type:        'invoices',
    label:       'All Invoices',
    description: 'Invoice headers with customer, date, totals and status',
    icon:        '🧾',
    adminOnly:   false,
  },
  {
    type:        'purchases',
    label:       'All Purchases',
    description: 'Purchase invoice headers with supplier, date, totals and status',
    icon:        '🛒',
    adminOnly:   true,
  },
  {
    type:        'tailoring-orders',
    label:       'Tailoring Orders',
    description: 'All tailoring orders with design, customer, stage and price',
    icon:        '✂️',
    adminOnly:   false,
  },
] as const;

export default async function DataExportPage() {
  const session = await requireRole('admin', 'accountant');
  const isAdmin = session.role === 'admin';

  const available = EXPORTS.filter((e) => !e.adminOnly || isAdmin);

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Export Data
          </nav>
          <h1 className="page-title">Data Export</h1>
          <p className="text-sm text-gray-500 mt-1">Download any dataset as CSV or JSON.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((e) => (
          <div key={e.type} className="card flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{e.icon}</span>
              <div>
                <h2 className="font-semibold text-gray-900">{e.label}</h2>
                {e.adminOnly && (
                  <span className="text-xs text-amber-600">Admin only</span>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 flex-1">{e.description}</p>
            <div className="flex gap-2">
              <a
                href={`/api/reports/export/${e.type}`}
                className="btn-primary text-sm text-center flex-1"
                download
              >
                Download CSV
              </a>
              <a
                href={`/api/reports/export/${e.type}?format=json`}
                className="btn-secondary text-sm text-center flex-1"
                download
              >
                Download JSON
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
