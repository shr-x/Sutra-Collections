import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import ConfirmForm from '@/components/confirm-form';
import { deleteOrderAction } from '../actions';
import OrderDetailsPanel from './order-details-panel';
import AssignTailorSection from './assign-tailor-section';
import StatusActions from './status-actions';
import DeliveryActions from './delivery-actions';
import PaymentSection from './payment-section';
import AlterationSection from './alteration-section';
import type { TailoringStatus, TailoringPaymentMode } from '@/types';

export const metadata: Metadata = { title: 'Tailoring Order' };

const STATUS_BADGE: Record<TailoringStatus, string> = {
  in_progress:      'badge-amber',
  ready_for_pickup: 'badge-green',
  delivered:        'badge-gray',
};

const STATUS_LABEL: Record<TailoringStatus, string> = {
  in_progress:      'In Progress',
  ready_for_pickup: 'Ready for Pickup',
  delivered:        'Delivered',
};

const ALL_STATUSES: TailoringStatus[] = ['in_progress', 'ready_for_pickup', 'delivered'];

export default async function TailoringOrderDetailPage({ params }: { params: { id: string } }) {
  const session = await requireRole('admin', 'staff');

  const res = await query(
    `SELECT o.id, o.order_number, o.group_number, o.suffix, o.status,
            o.total_amount::numeric, o.amount_paid::numeric, o.credit_amount::numeric,
            o.credited_at, o.delivered_at,
            o.due_date::text, o.notes,
            o.color_fabric, o.created_at, o.updated_at, o.tailor_id, o.batch_id,
            o.invoice_id,
            c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone,
            d.id AS design_id, d.name AS design_name, d.category AS design_category,
            d.photo_path AS design_photo,
            mv.id AS version_id, mv.version_number,
            t.name AS tailor_name,
            creator.name AS created_by_name
     FROM tailoring_orders o
     JOIN customers c    ON c.id = o.customer_id
     JOIN designs d      ON d.id = o.design_id
     LEFT JOIN measurement_versions mv ON mv.id = o.measurement_version_id
     LEFT JOIN tailors t ON t.id = o.tailor_id
     LEFT JOIN users creator ON creator.id = o.created_by
     WHERE o.id = $1`,
    [params.id]
  );
  if (!res.rows[0]) notFound();
  const order = res.rows[0];

  // Real GST invoice(s) for this order — the root invoice created at first
  // ready_for_pickup, plus any supplementary invoices created for later
  // alteration deltas once the root was locked. Excluded from the general
  // Billing > Invoices list (source='tailoring'), but always viewable here.
  interface OrderInvoiceRow { id: string; invoice_number: string; grand_total: string; status: string; is_supplementary: boolean }
  const orderInvoices: OrderInvoiceRow[] = [];
  if (order.invoice_id) {
    const invRes = await query<OrderInvoiceRow>(
      `SELECT id, invoice_number, grand_total::text, status, FALSE AS is_supplementary
       FROM invoices WHERE id=$1
       UNION ALL
       SELECT id, invoice_number, grand_total::text, status, TRUE AS is_supplementary
       FROM invoices WHERE supplementary_of_invoice_id=$1
       ORDER BY is_supplementary ASC`,
      [order.invoice_id]
    );
    orderInvoices.push(...invRes.rows);
  }

  const [fieldsRes, paymentsRes, alterationsRes] = await Promise.all([
    query<{ id: string; field_name: string; field_type: 'number' | 'text'; unit: string | null }>(
      `SELECT id, field_name, field_type, unit
       FROM design_measurement_fields WHERE design_id=$1
       ORDER BY sort_order, field_name`,
      [order.design_id]
    ),
    query<{ id: string; amount: string; payment_mode: TailoringPaymentMode; recorded_at: string; recorded_by_name: string | null }>(
      `SELECT p.id, p.amount::text, p.payment_mode, p.recorded_at, u.name AS recorded_by_name
       FROM tailoring_payments p
       LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.tailoring_order_id = $1
       ORDER BY p.recorded_at DESC`,
      [params.id]
    ),
    query<{ id: string; description: string; price_adjustment: string; requested_at: string; requested_by_name: string | null }>(
      `SELECT a.id, a.description, a.price_adjustment::text, a.requested_at, u.name AS requested_by_name
       FROM tailoring_alterations a
       LEFT JOIN users u ON u.id = a.requested_by
       WHERE a.tailoring_order_id = $1
       ORDER BY a.requested_at DESC`,
      [params.id]
    ),
  ]);

  const valRes = order.version_id
    ? await query<{ field_id: string; value: string }>(
        `SELECT f.id AS field_id, mv.value
         FROM measurement_values mv
         JOIN design_measurement_fields f ON f.id = mv.field_id
         WHERE mv.version_id = $1`,
        [order.version_id]
      )
    : { rows: [] };

  const currentMeasurements: Record<string, string> = {};
  for (const row of valRes.rows) {
    currentMeasurements[row.field_id] = row.value;
  }

  interface SiblingRow {
    id: string;
    order_number: string;
    group_number: string | null;
    suffix: string | null;
    status: TailoringStatus;
    design_name: string;
    color_fabric: string | null;
  }
  const siblings: SiblingRow[] = [];
  if (order.batch_id) {
    const sibRes = await query<SiblingRow>(
      `SELECT o.id, o.order_number, o.group_number, o.suffix, o.status, d.name AS design_name, o.color_fabric
       FROM tailoring_orders o
       JOIN designs d ON d.id = o.design_id
       WHERE o.batch_id = $1 AND o.id != $2
       ORDER BY o.suffix ASC, o.created_at ASC`,
      [order.batch_id, order.id]
    );
    siblings.push(...sibRes.rows);
  }

  const status  = order.status as TailoringStatus;
  const currIdx = ALL_STATUSES.indexOf(status);
  const isAdmin = session.role === 'admin';

  const totalAmount   = Number(order.total_amount);
  const amountPaid    = Number(order.amount_paid);
  const creditAmount  = Number(order.credit_amount);
  const balanceDue    = Math.round((totalAmount - amountPaid) * 100) / 100;

  const payments = paymentsRes.rows.map((p) => ({ ...p, amount: Number(p.amount) }));
  const alterations = alterationsRes.rows.map((a) => ({ ...a, price_adjustment: Number(a.price_adjustment) }));

  return (
    <div>
      {/* ── Page header ── */}
      <div className="mb-4 sm:mb-6">
        <Link href="/tailoring" className="text-sm text-purple-600 hover:underline">
          ← Tailoring Orders
        </Link>

        {/* Title row: order number + status badge */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="page-title">{order.order_number}</h1>
          <span className={STATUS_BADGE[status]}>
            {STATUS_LABEL[status]}
          </span>
          {order.batch_id && (
            <span className="badge-amber">
              🔗 {siblings.length + 1} items
            </span>
          )}
        </div>

        {order.batch_id && order.group_number && (
          <p className="mt-0.5 text-xs text-gray-500">
            Part of group {order.group_number}, item {order.suffix} of {siblings.length + 1}
          </p>
        )}

        {/* Action buttons row — clearly rectangular, distinct from status badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={`/api/tailoring/${order.id}/customer-pdf`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm"
          >
            📄 Customer PDF
          </a>
          <a
            href={`/api/tailoring/${order.id}/tailor-pdf`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm"
          >
            🔧 Tailor PDF
          </a>
          {isAdmin && (
            <ConfirmForm
              action={deleteOrderAction}
              message={`Delete order ${order.order_number}? This cannot be undone.`}
            >
              <input type="hidden" name="id" value={order.id} />
              <button type="submit" className="btn-destructive btn-sm">
                🗑 Delete
              </button>
            </ConfirmForm>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: editable details + measurements */}
        <div className="lg:col-span-2 space-y-4">
          <OrderDetailsPanel
            orderId={order.id}
            status={status}
            currentColorFabric={order.color_fabric}
            currentNotes={order.notes}
            currentDueDate={order.due_date}
            fields={fieldsRes.rows}
            currentMeasurements={currentMeasurements}
            currentVersionNumber={order.version_number ? Number(order.version_number) : null}
            customerId={order.customer_id}
            customerName={order.customer_name}
            customerPhone={order.customer_phone}
            designId={order.design_id}
            designName={order.design_name}
            designCategory={order.design_category}
            totalAmount={totalAmount}
          />

          <AlterationSection orderId={order.id} status={status} alterations={alterations} />
        </div>

        {/* Right: status + payment + tailor + photo + meta + batch siblings */}
        <div className="space-y-4">
          {/* Status card */}
          <div className="card">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Status</h2>

            {/* Vertical timeline */}
            <ol className="mb-4 space-y-0">
              {ALL_STATUSES.map((s, i) => {
                const sIdx    = ALL_STATUSES.indexOf(s);
                const done    = sIdx < currIdx;
                const current = s === status;
                return (
                  <li key={s} className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                          current ? 'border-purple-600 bg-purple-600' :
                          done    ? 'border-purple-300 bg-purple-200' :
                                    'border-gray-200 bg-white'
                        }`}
                      />
                      {i < ALL_STATUSES.length - 1 && (
                        <div
                          className={`w-0.5 flex-1 ${done ? 'bg-purple-200' : 'bg-gray-100'}`}
                          style={{ minHeight: 18 }}
                        />
                      )}
                    </div>
                    <div className="pb-3">
                      <p className={`text-sm leading-5 ${
                        current ? 'font-bold text-purple-700' :
                        done    ? 'text-gray-400' :
                                  'text-gray-300'
                      }`}>
                        {STATUS_LABEL[s]}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Tailor assignment — only while stitching is in progress */}
            {status === 'in_progress' && (
              <AssignTailorSection
                orderId={order.id}
                status={status}
                currentTailorId={order.tailor_id ?? null}
                currentTailorName={order.tailor_name ?? null}
              />
            )}

            {/* Forward status advance (in_progress -> ready_for_pickup) */}
            <StatusActions orderId={order.id} status={status} />

            {/* Delivery decision — available once ready for pickup */}
            {status === 'ready_for_pickup' && (
              <DeliveryActions orderId={order.id} balanceDue={balanceDue} currentTotal={totalAmount} />
            )}
          </div>

          <PaymentSection
            orderId={order.id}
            totalAmount={totalAmount}
            amountPaid={amountPaid}
            creditAmount={creditAmount}
            payments={payments}
          />

          {/* GST Invoices — the real, filed accounting document(s) for this
              order. Kept out of the general Billing > Invoices list but always
              viewable here. */}
          {orderInvoices.length > 0 && (
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">GST Invoice{orderInvoices.length > 1 ? 's' : ''}</h2>
              <ul className="space-y-2">
                {orderInvoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div>
                      <Link href={`/billing/invoices/${inv.id}`} className="font-mono text-xs font-bold text-purple-700 hover:underline">
                        {inv.invoice_number}
                      </Link>
                      {inv.is_supplementary && (
                        <span className="ml-1.5 text-xs italic text-gray-400">supplementary</span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-gray-700">
                      ₹{Number(inv.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Batch siblings */}
          {order.batch_id && (
            <div className="card">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <span>🔗</span>
                <span>
                  {order.group_number
                    ? `Group ${order.group_number} — ${siblings.length + 1} items`
                    : `Batch (${siblings.length + 1} items)`}
                </span>
              </h2>
              <ul className="space-y-2">
                <li className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-purple-700">
                      {order.order_number}
                    </span>
                    <span className="ml-1.5 text-xs text-gray-500">{order.design_name}</span>
                    {order.color_fabric && <span className="ml-1 text-xs italic text-gray-400">{order.color_fabric}</span>}
                  </div>
                  <span className={STATUS_BADGE[status]}>
                    {STATUS_LABEL[status]}
                  </span>
                </li>
                {siblings.map((sib) => (
                  <li key={sib.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div>
                      <Link
                        href={`/tailoring/${sib.id}`}
                        className="font-mono text-xs font-bold text-purple-700 hover:underline"
                      >
                        {sib.order_number}
                      </Link>
                      <span className="ml-1.5 text-xs text-gray-500">{sib.design_name}</span>
                      {sib.color_fabric && <span className="ml-1 text-xs italic text-gray-400">{sib.color_fabric}</span>}
                    </div>
                    <span className={STATUS_BADGE[sib.status]}>
                      {STATUS_LABEL[sib.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Design photo */}
          {order.design_photo && (
            <div className="card overflow-hidden p-0">
              <img
                src={`/${order.design_photo}`}
                alt={order.design_name}
                className="max-h-64 w-full object-cover"
              />
              <div className="px-4 py-2 text-xs text-gray-500">Design: {order.design_name}</div>
            </div>
          )}

          {/* Meta */}
          <div className="card space-y-1 text-xs text-gray-400">
            <div>Created: {new Date(order.created_at).toLocaleString('en-IN')}</div>
            {order.created_by_name && <div>By: {order.created_by_name}</div>}
            <div>Updated: {new Date(order.updated_at).toLocaleString('en-IN')}</div>
            {order.delivered_at && <div>Delivered: {new Date(order.delivered_at).toLocaleString('en-IN')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
