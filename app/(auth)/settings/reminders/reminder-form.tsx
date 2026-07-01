'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { ActionResult } from '@/types';

const INIT: ActionResult = { success: false, error: '' };

const VARIABLES = ['{{name}}', '{{invoice_number}}', '{{amount}}', '{{days}}'];

interface Props {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  defaultValues?: {
    day_threshold?: number;
    tone?: string;
    message_template?: string;
    is_active?: boolean;
  };
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
      {pending ? 'Saving…' : 'Save Reminder Setting'}
    </button>
  );
}

export default function ReminderForm({ action, defaultValues }: Props) {
  const [state, formAction] = useFormState(action, INIT);

  return (
    <form action={formAction} className="space-y-5 max-w-xl">
      {state.error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Days Overdue Threshold</label>
            <input
              name="day_threshold"
              type="number"
              min="1"
              max="365"
              required
              defaultValue={defaultValues?.day_threshold ?? 7}
              className="form-input"
            />
            <p className="mt-1 text-xs text-gray-400">Send when invoice is overdue by this many days</p>
          </div>
          <div>
            <label className="form-label">Tone</label>
            <select name="tone" defaultValue={defaultValues?.tone ?? 'gentle'} className="form-input">
              <option value="gentle">Gentle (first reminder)</option>
              <option value="firm">Firm (follow-up)</option>
              <option value="final">Final notice</option>
            </select>
          </div>
        </div>

        <div>
          <label className="form-label">Message Template</label>
          <textarea
            name="message_template"
            rows={5}
            required
            defaultValue={defaultValues?.message_template ?? ''}
            className="form-input font-mono text-xs"
            placeholder="Hi {{name}}, your invoice {{invoice_number}} of {{amount}} is {{days}} day(s) overdue…"
          />
          <p className="mt-1 text-xs text-gray-400">
            Available variables:&nbsp;
            {VARIABLES.map((v) => (
              <code key={v} className="mx-0.5 rounded bg-gray-100 px-1 py-0.5 text-purple-600">{v}</code>
            ))}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            name="is_active"
            type="checkbox"
            id="is_active"
            defaultChecked={defaultValues?.is_active ?? true}
            value="true"
            className="h-4 w-4 rounded border-gray-300 text-purple-600"
          />
          <label htmlFor="is_active" className="text-sm text-gray-700">Active (will run in daily cron)</label>
        </div>
      </div>

      <div className="flex gap-3">
        <SubmitBtn />
        <a href="/settings/reminders" className="btn-secondary">Cancel</a>
      </div>
    </form>
  );
}
