'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createSAInvoiceAction } from '../actions';
import Link from 'next/link';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'Creating…' : 'Create Invoice'}
    </button>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required,
  placeholder,
  step,
  min,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm text-gray-400">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
        className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
      />
    </div>
  );
}

export default function NewInvoicePage() {
  const [state, formAction] = useFormState(createSAInvoiceAction, null);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">New Invoice</h1>
        <Link
          href="/sa-console-x7k2/invoices"
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          ← Back
        </Link>
      </div>

      {/* SA backdating warning */}
      <div className="rounded border border-yellow-700 bg-yellow-900/30 px-4 py-3 text-sm text-yellow-300">
        ⚠️ SA Console: Backdating allowed. No restrictions on invoice date.
      </div>

      <form action={formAction} className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6">
        <Field label="Invoice Number" name="invoice_number" required placeholder="INV/2026-27/0001" />

        {/* Date — intentionally no min/max so backdating is unrestricted */}
        <div>
          <label htmlFor="invoice_date" className="mb-1 block text-sm text-gray-400">
            Date
          </label>
          <input
            id="invoice_date"
            name="invoice_date"
            type="date"
            required
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <Field
          label="Customer ID (UUID, leave blank for Walk-in)"
          name="customer_id"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />

        <div>
          <label className="mb-1 block text-sm text-gray-400">Status</label>
          <select
            name="status"
            defaultValue="paid"
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">Payment Mode</label>
          <select
            name="payment_mode"
            defaultValue="cash"
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="credit">Credit</option>
          </select>
        </div>

        <Field label="Grand Total (₹)" name="grand_total" type="number" step="0.01" min="0" required placeholder="0.00" />
        <Field label="Amount Paid (₹)" name="amount_paid" type="number" step="0.01" min="0" required placeholder="0.00" />

        <div>
          <label htmlFor="notes" className="mb-1 block text-sm text-gray-400">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Internal notes…"
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
            href="/sa-console-x7k2/invoices"
            className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
