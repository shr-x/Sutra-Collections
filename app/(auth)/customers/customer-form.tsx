'use client';

import DatePicker from '@/components/date-picker';

import { useFormState, useFormStatus } from 'react-dom';
import type { CustomerState } from './actions';
import type { Customer } from '@/types';

// `date_of_birth` arrives here as a raw pg `Date` object (SELECT * returns Date
// for DATE columns, not a string) — String(date) gives "Sun Aug 02 2026 ...",
// NOT an ISO date, which corrupts DatePicker's "YYYY-MM-DD" parsing. Also
// tolerate a pre-formatted ISO string, in case a caller ever passes one.
function toIsoDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : label}
    </button>
  );
}

interface Props {
  action: (prev: CustomerState | null, data: FormData) => Promise<CustomerState>;
  defaultValues?: Partial<Customer>;
  isAdmin: boolean;
  cancelHref: string;
}

export default function CustomerForm({ action, defaultValues, isAdmin, cancelHref }: Props) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      {state?.error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <label className="label mb-1">Full Name *</label>
        <input name="name" className="input" required maxLength={255} defaultValue={defaultValues?.name} />
      </div>

      <div>
        <label className="label mb-1">
          Phone{' '}
          <span className="font-normal text-gray-400">(required for credit)</span>
        </label>
        <input name="phone" type="tel" className="input" maxLength={20} defaultValue={defaultValues?.phone ?? ''} />
      </div>

      <div>
        <label className="label mb-1">Address</label>
        <textarea name="address" className="input" rows={2} defaultValue={defaultValues?.address ?? ''} />
      </div>

      <div>
        <label className="label mb-1">GSTIN <span className="font-normal text-gray-400">(optional)</span></label>
        <input
          name="gstin"
          className="input font-mono uppercase"
          maxLength={15}
          placeholder="22AAAAA0000A1Z5"
          defaultValue={defaultValues?.gstin ?? ''}
        />
      </div>

      <div>
        <label className="label mb-1">
          Credit Limit (₹)
          {!isAdmin && <span className="ml-2 text-xs text-gray-400">(admin-only)</span>}
        </label>
        <input
          name="credit_limit"
          type="number"
          min="0"
          step="0.01"
          className="input"
          defaultValue={defaultValues?.credit_limit ?? 0}
          readOnly={!isAdmin}
          disabled={!isAdmin}
        />
      </div>

      <div>
        <label className="label mb-1">Date of Birth</label>
        <DatePicker
          name="date_of_birth"
          className="input"
          defaultValue={
            defaultValues && 'date_of_birth' in defaultValues && defaultValues.date_of_birth
              ? toIsoDate(defaultValues.date_of_birth)
              : ''
          }
        />
      </div>

      <div className="space-y-2">
        <label className="label">Preferences</label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="whatsapp_opt_out"
            defaultChecked={defaultValues?.whatsapp_opt_out ?? false}
            className="h-4 w-4 rounded border-gray-300 text-purple-600"
          />
          Opted out of WhatsApp messages
        </label>
        {/* Hidden mirror lets the server tell "unchecked" apart from "field absent". */}
        <input type="hidden" name="marketing_field_present" value="1" />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="marketing_opt_in"
            defaultChecked={defaultValues?.marketing_opt_in ?? true}
            className="h-4 w-4 rounded border-gray-300 text-purple-600"
          />
          Receive marketing messages (offers, birthday &amp; anniversary greetings)
        </label>
        <p className="text-xs text-gray-400">
          Transactional messages (invoices, order updates, payment reminders) are always sent regardless of this setting.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <Submit label={defaultValues ? 'Update Customer' : 'Create Customer'} />
        <a href={cancelHref} className="btn-secondary">Cancel</a>
      </div>
    </form>
  );
}
