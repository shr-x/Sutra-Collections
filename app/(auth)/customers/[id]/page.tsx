import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import ConfirmForm from '@/components/confirm-form';
import { deleteCustomerAction, toggleMarketingOptInAction } from '../actions';
import type { Customer } from '@/types';

export const metadata: Metadata = { title: 'Customer' };

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  grand_total: number;
  amount_paid: number;
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const session = await requireRole('admin');

  const [custRes, invoicesRes, outstandingRes, measurementsRes, insightsRes, loyaltyRes, tailoringDuesRes] = await Promise.all([
    query<Customer & { store_credit_balance: number; loyalty_points_balance: number; date_of_birth: string | null }>(
      `SELECT *, store_credit_balance, loyalty_points_balance, date_of_birth FROM customers WHERE id=$1`, [params.id]
    ),
    query<InvoiceRow>(
      `SELECT id, invoice_number, invoice_date, status, grand_total, amount_paid
       FROM invoices WHERE customer_id=$1
       ORDER BY invoice_date DESC LIMIT 5`,
      [params.id]
    ),
    // Pure invoice-balance across ALL issued invoices (POS and tailoring alike),
    // consistent with the Outstanding Dues report/page and each tailoring
    // order's own balance. Tailoring invoices are included because their
    // amount_paid/status is now kept in lockstep with tailoring payments (see
    // syncPaymentToInvoices in tailoring/actions.ts). The "Tailoring Credit Due"
    // card below is a SUBSET of this figure (the delivered-on-credit portion),
    // not an additional amount.
    query<{ outstanding: string }>(
      `SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS outstanding
       FROM invoices WHERE customer_id=$1 AND status IN ('issued','partially_paid')`,
      [params.id]
    ),
    query(
      `SELECT mv.id, mv.version_number, mv.created_at, mv.design_id,
              d.name AS design_name, d.category AS design_category,
              u.name AS taken_by_name,
              json_agg(
                json_build_object('field_name', f.field_name, 'unit', f.unit, 'value', mval.value)
                ORDER BY f.sort_order, f.field_name
              ) FILTER (WHERE mval.id IS NOT NULL) AS values
       FROM measurement_versions mv
       JOIN designs d ON d.id = mv.design_id
       LEFT JOIN users u ON u.id = mv.taken_by
       LEFT JOIN measurement_values mval ON mval.version_id = mv.id
       LEFT JOIN design_measurement_fields f ON f.id = mval.field_id
       WHERE mv.customer_id = $1
       GROUP BY mv.id, mv.version_number, mv.created_at, mv.design_id,
                d.name, d.category, u.name
       ORDER BY d.name, mv.version_number DESC`,
      [params.id]
    ),
    query<{ invoice_count: string; lifetime_value: string; avg_order_value: string; last_purchase: string | null }>(
      `SELECT COUNT(*)::text AS invoice_count,
              COALESCE(SUM(grand_total),0)::text AS lifetime_value,
              COALESCE(AVG(grand_total),0)::text AS avg_order_value,
              MAX(invoice_date)::text AS last_purchase
       FROM invoices WHERE customer_id=$1 AND status NOT IN ('cancelled','draft')`,
      [params.id]
    ),
    query(
      `SELECT lt.points, lt.type, lt.reference_type, lt.created_at,
              COALESCE(i.invoice_number, '') AS ref_label
       FROM loyalty_transactions lt
       LEFT JOIN invoices i ON i.id=lt.reference_id AND lt.reference_type='invoice'
       WHERE lt.customer_id=$1
       ORDER BY lt.created_at DESC LIMIT 20`,
      [params.id]
    ),
    query<{ total: string }>(
      `SELECT COALESCE(SUM(credit_amount), 0)::text AS total
       FROM tailoring_orders WHERE customer_id=$1 AND credit_amount > 0`,
      [params.id]
    ),
  ]);

  if (!custRes.rows[0]) notFound();
  const c           = custRes.rows[0];
  const insights    = insightsRes.rows[0];
  const loyaltyTxns = loyaltyRes.rows as Array<{ points: number; type: string; reference_type: string; created_at: string; ref_label: string }>;
  const invoices    = invoicesRes.rows.map((r) => ({
    ...r,
    grand_total: Number(r.grand_total),
    amount_paid: Number(r.amount_paid),
  }));
  const outstanding = Number(outstandingRes.rows[0]?.outstanding ?? 0);
  const storeCredit = Number(c.store_credit_balance ?? 0);
  const tailoringDues = Number(tailoringDuesRes.rows[0]?.total ?? 0);

  type MeasRow = {
    id: string; version_number: number; created_at: string;
    design_id: string; design_name: string; design_category: string | null;
    taken_by_name: string | null;
    values: Array<{ field_name: string; unit: string | null; value: string }> | null;
  };
  const measurementsByDesign: Record<string, { designId: string; designName: string; designCategory: string | null; versions: MeasRow[] }> = {};
  for (const row of measurementsRes.rows as MeasRow[]) {
    if (!measurementsByDesign[row.design_id]) {
      measurementsByDesign[row.design_id] = {
        designId: row.design_id,
        designName: row.design_name,
        designCategory: row.design_category,
        versions: [],
      };
    }
    measurementsByDesign[row.design_id].versions.push(row);
  }
  const measurementGroups = Object.values(measurementsByDesign);

  const STATUS_COLOR: Record<string, string> = {
    issued:         'bg-blue-100 text-blue-700',
    paid:           'bg-green-100 text-green-700',
    partially_paid: 'bg-yellow-100 text-yellow-700',
    overdue:        'bg-red-100 text-red-700',
    cancelled:      'bg-gray-100 text-gray-400',
    draft:          'bg-gray-100 text-gray-500',
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <Link href="/customers" className="text-sm text-purple-600 hover:underline">← Customers</Link>
          <h1 className="page-title mt-1">{c.name}</h1>
          {c.phone && <p className="text-sm text-gray-500 mt-0.5">{c.phone}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/billing/invoices/new?customer=${c.id}`} className="btn-primary text-sm">
            + New Invoice
          </Link>
          <Link href={`/customers/${c.id}/edit`} className="btn-secondary">Edit</Link>
          {session.role === 'admin' && (
            <ConfirmForm
              action={deleteCustomerAction}
              message="Erase this customer's personal data (name, phone, address)? Transaction history is kept for accounting. This cannot be undone."
            >
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors">
                Delete
              </button>
            </ConfirmForm>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ── LEFT COLUMN: Details → Measurements → Balance ───────────────── */}
        <div className="space-y-4">

          {/* Details */}
          <div className="card">
            <h2 className="mb-4 font-semibold text-gray-900">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-gray-500">Phone</dt>
                <dd className="text-right font-medium text-gray-900">
                  {c.phone || (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      Walk-in / No Contact
                    </span>
                  )}
                </dd>
              </div>
              {c.address && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-gray-500">Address</dt>
                  <dd className="text-right font-medium text-gray-900">{c.address}</dd>
                </div>
              )}
              {c.gstin && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-gray-500">GSTIN</dt>
                  <dd className="font-mono font-medium text-gray-900">{c.gstin}</dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-gray-500">WhatsApp</dt>
                <dd className="text-gray-700">{c.whatsapp_opt_out ? 'Opted out' : 'Opted in'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="shrink-0 text-gray-500">Marketing Messages</dt>
                <dd className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.marketing_opt_in ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.marketing_opt_in ? 'On' : 'Off'}
                  </span>
                  <form action={toggleMarketingOptInAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-xs text-purple-600 hover:underline">
                      {c.marketing_opt_in ? 'Turn off' : 'Turn on'}
                    </button>
                  </form>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-gray-500">Added</dt>
                <dd className="text-gray-700">{new Date(c.created_at).toLocaleDateString('en-IN')}</dd>
              </div>
            </dl>
          </div>

          {/* Measurements */}
          {measurementGroups.length > 0 && (
            <div>
              <h2 className="mb-3 text-base font-semibold text-gray-900">Measurements</h2>
              <div className="space-y-4">
                {measurementGroups.map((group) => (
                  <div key={group.designId} className="card p-0 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                      <div>
                        <Link href={`/designs/${group.designId}`}
                          className="font-semibold text-sm text-purple-700 hover:underline">
                          {group.designName}
                        </Link>
                        {group.designCategory && (
                          <span className="ml-2 text-xs text-gray-400">{group.designCategory}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {group.versions.length} version{group.versions.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {group.versions.map((v) => (
                        <div key={v.id} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-gray-700 bg-gray-100 rounded-full px-2 py-0.5">
                                v{v.version_number}
                              </span>
                              <span className="text-xs text-gray-400">
                                {new Date(v.created_at).toLocaleDateString('en-IN', {
                                  day: 'numeric', month: 'short', year: 'numeric',
                                })}
                                {v.taken_by_name ? ` · by ${v.taken_by_name}` : ''}
                              </span>
                            </div>
                            <Link href={`/tailoring/new?design=${group.designId}&version=${v.id}`}
                              className="text-xs text-purple-600 hover:underline">
                              New order →
                            </Link>
                          </div>
                          {v.values && v.values.length > 0 ? (
                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                              {v.values.map((val) => (
                                <div key={val.field_name} className="text-xs">
                                  <span className="text-gray-500">{val.field_name}: </span>
                                  <span className="font-medium text-gray-800">
                                    {val.value}{val.unit ? ` ${val.unit}` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No values recorded.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Balance */}
          <div className="card">
            <h2 className="mb-4 font-semibold text-gray-900">Balance</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <span className="text-sm text-gray-600">Outstanding</span>
                <span className={`text-base font-bold ${outstanding > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                  {outstanding > 0 ? formatInr(outstanding) : '—'}
                </span>
              </div>
              {storeCredit > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
                  <span className="text-sm font-medium text-blue-700">Store Credit</span>
                  <span className="text-base font-bold text-blue-800">{formatInr(storeCredit)}</span>
                </div>
              )}
              {tailoringDues > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <span className="text-sm font-medium text-amber-800">
                    On Credit <span className="font-normal text-amber-600">(part of Outstanding)</span>
                  </span>
                  <span className="text-base font-bold text-amber-800">{formatInr(tailoringDues)}</span>
                </div>
              )}
              {!c.phone && (
                <p className="text-xs text-amber-600">⚠ No phone number — credit sales not allowed</p>
              )}
              <Link href={`/customers/dues?customer=${c.id}`}
                className="block text-xs text-purple-600 hover:underline mt-1">
                View in Dues Dashboard →
              </Link>
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN: Insights → Recent Invoices → Loyalty ──────────── */}
        <div className="space-y-4">

          {/* Tailoring quick link */}
          {c.phone && (
            <div className="card flex items-center justify-between py-3">
              <span className="text-sm text-gray-600">Tailoring orders for this customer</span>
              <Link href={`/tailoring?q=${encodeURIComponent(c.name)}`}
                className="text-sm text-purple-600 hover:underline">
                View Orders →
              </Link>
            </div>
          )}

          {/* Customer Insights */}
          <div className="card">
            <h2 className="mb-3 font-semibold text-gray-900">Insights</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-purple-50 px-3 py-2.5 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Lifetime Value</p>
                <p className="text-base font-bold text-purple-700">{formatInr(Number(insights?.lifetime_value ?? 0))}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Total Invoices</p>
                <p className="text-base font-bold text-gray-800">{Number(insights?.invoice_count ?? 0)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Avg. Order</p>
                <p className="text-base font-bold text-gray-800">{formatInr(Number(insights?.avg_order_value ?? 0))}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Last Purchase</p>
                <p className="text-sm font-bold text-gray-800">
                  {insights?.last_purchase
                    ? new Date(insights.last_purchase + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
                    : <span className="text-gray-400">—</span>
                  }
                </p>
              </div>
            </div>
            {c.date_of_birth && (
              <div className="mt-3 flex gap-4 text-xs">
                <span className="text-gray-500">
                  🎂 {new Date(c.date_of_birth + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            )}
          </div>

          {/* Recent Invoices */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Recent Invoices</h2>
              <Link href={`/billing/invoices/new?customer=${c.id}`}
                className="text-xs text-purple-600 hover:underline">
                + New Invoice
              </Link>
            </div>
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center text-gray-400">
                <p className="text-3xl mb-2">🧾</p>
                <p className="text-sm">No invoices yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Invoice</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => {
                    const bal = inv.grand_total - inv.amount_paid;
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link href={`/billing/invoices/${inv.id}`}
                            className="font-mono text-sm text-purple-700 hover:underline">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(inv.invoice_date).toLocaleDateString('en-IN')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLOR[inv.status] ?? ''}`}>
                            {inv.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatInr(inv.grand_total)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${bal > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                          {bal > 0 ? formatInr(bal) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {outstanding > 0 && (
                  <tfoot className="border-t-2 border-gray-300 bg-red-50">
                    <tr className="font-semibold text-red-700">
                      <td colSpan={4} className="px-4 py-3 text-sm">Total Outstanding</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatInr(outstanding)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>

          {/* Loyalty Points */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Loyalty Points</h2>
              <span className="text-2xl font-bold text-purple-700">
                {Number(c.loyalty_points_balance ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
            {loyaltyTxns.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {loyaltyTxns.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div>
                      <span className={`font-medium ${t.type === 'earned' ? 'text-green-700' : 'text-red-600'}`}>
                        {t.type === 'earned' ? '+' : ''}{t.points} pts
                      </span>
                      {t.ref_label && <span className="ml-1 text-gray-400">· {t.ref_label}</span>}
                    </div>
                    <span className="text-gray-400">
                      {new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No loyalty transactions yet.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
