'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateInvoiceAction } from '../../actions';
import Link from 'next/link';

interface InvoiceEditData {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  payment_mode: string | null;
  grand_total: string;
  amount_paid: string;
  notes: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Save Changes'}
    </button>
  );
}

export default function EditInvoiceForm({ invoice }: { invoice: InvoiceEditData }) {
  // Bind the invoice id to the action — Next.js server action pattern for extra params
  const boundAction = updateInvoiceAction.bind(null, invoice.id);
  const [state, formAction] = useFormState(boundAction, null);

  // Date columns come back as "YYYY-MM-DD" from PostgreSQL
  const dateValue = invoice.invoice_date.split('T')[0];

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6">
      <div className="rounded border border-yellow-700 bg-yellow-900/30 px-4 py-3 text-sm text-yellow-300">
        ⚠️ SA Console: Backdating allowed. No date restrictions.
        Line items cannot be edited here — recreate the invoice to change them.
      </div>

      <div>
        <p className="mb-1 text-sm text-gray-500">Invoice Number (read-only)</p>
        <p className="text-white font-medium">{invoice.invoice_number}</p>
      </div>

      {/* Date — no min/max */}
      <div>
        <label htmlFor="invoice_date" className="mb-1 block text-sm text-gray-400">
          Date
        </label>
        <input
          id="invoice_date"
          name="invoice_date"
          type="date"
          required
          defaultValue={dateValue}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Status</label>
        <select
          name="status"
          defaultValue={invoice.status}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="draft">Draft</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Payment Mode</label>
        <select
          name="payment_mode"
          defaultValue={invoice.payment_mode ?? ''}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">—</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="upi">UPI</option>
          <option value="credit">Credit</option>
        </select>
      </div>

      <div>
        <label htmlFor="grand_total" className="mb-1 block text-sm text-gray-400">
          Grand Total (₹)
        </label>
        <input
          id="grand_total"
          name="grand_total"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={parseFloat(invoice.grand_total).toFixed(2)}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="amount_paid" className="mb-1 block text-sm text-gray-400">
          Amount Paid (₹)
        </label>
        <input
          id="amount_paid"
          name="amount_paid"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={parseFloat(invoice.amount_paid).toFixed(2)}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm text-gray-400">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={invoice.notes ?? ''}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {state?.error && (
        <p className="rounded border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <SubmitButton />
        <Link
          href={`/sa-console-x7k2/invoices/${invoice.id}`}
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
