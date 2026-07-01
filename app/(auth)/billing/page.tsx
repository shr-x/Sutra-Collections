import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';

export const metadata: Metadata = { title: 'Billing' };

export default async function BillingPage() {
  await requireRole('admin', 'staff');

  const [invRes, cnRes, purRes] = await Promise.all([
    query<{ count: string; total: string; unpaid: string }>(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(grand_total), 0) AS total,
         COALESCE(SUM(CASE WHEN status IN ('issued','partially_paid','overdue') THEN (grand_total - amount_paid) ELSE 0 END), 0) AS unpaid
       FROM invoices WHERE invoice_date >= date_trunc('month', CURRENT_DATE)`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM credit_notes
       WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)`
    ),
    query<{ total: string }>(
      `SELECT COALESCE(SUM(grand_total), 0) AS total FROM purchase_invoices
       WHERE date_trunc('month', purchase_date) = date_trunc('month', CURRENT_DATE)`
    ),
  ]);

  const inv = invRes.rows[0];
  const cn = cnRes.rows[0];
  const pur = purRes.rows[0];

  const colorMap: Record<string, string> = {
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  const cards = [
    { label: 'This Month — Invoices', value: formatInr(Number(inv.total)), sub: `${inv.count} invoice${Number(inv.count) !== 1 ? 's' : ''}`, href: '/billing/invoices', color: 'purple' },
    { label: 'Outstanding Receivable', value: formatInr(Number(inv.unpaid)), sub: 'Unpaid / overdue', href: '/billing/invoices?status=overdue', color: 'red' },
    { label: 'Number of Refunds This Month', value: cn.count, sub: 'Refunds issued this month', href: '/billing/credit-notes', color: 'amber' },
    { label: 'Purchase Amount This Month', value: formatInr(Number(pur.total)), sub: 'Total purchases this month', href: '/billing/purchases', color: 'orange' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Billing</h1>
        <Link href="/billing/invoices/new" className="btn-primary">+ New Invoice</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className={`card border hover:shadow-md transition-shadow ${colorMap[c.color]}`}>
            <p className="text-xs font-medium opacity-70">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
            <p className="text-xs opacity-60 mt-0.5">{c.sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { href: '/billing/invoices', icon: '🧾', label: 'Sales Invoices', desc: 'Track and manage all customer bills' },
          { href: '/billing/credit-notes', icon: '↩', label: 'Refunds', desc: 'Process returns and GST reversals' },
          { href: '/billing/purchases', icon: '📥', label: 'Purchase Invoices', desc: 'Supplier bills with ITC tracking' },
          { href: '/billing/debit-notes', icon: '↪', label: 'Debit Notes', desc: 'Manage purchase returns' },
          { href: '/settings/schemes', icon: '🎁', label: 'Discount Schemes', desc: 'Buy X Get Y and promotional offers' },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="card flex items-start gap-3 hover:shadow-md transition-shadow">
            <span className="text-2xl">{item.icon}</span>
            <div>
              <p className="font-semibold text-gray-900">{item.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
