'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { ActionResult } from '@/types';

const INIT: ActionResult = { success: false, error: '' };

interface Setting { id: string; day_threshold: number; tone: string; }

interface Props {
  invoiceId: string;
  settings: Setting[];
  action: (id: string, prev: ActionResult, fd: FormData) => Promise<ActionResult>;
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary text-sm disabled:opacity-50">
      {pending ? 'Sending…' : 'Send WhatsApp Reminder'}
    </button>
  );
}

export default function ReminderButton({ invoiceId, settings, action }: Props) {
  const boundAction = action.bind(null, invoiceId);
  const [state, formAction] = useFormState(boundAction, INIT);

  return (
    <form action={formAction} className="flex flex-wrap gap-3 items-end">
      {settings.length > 0 && (
        <div>
          <label className="form-label">Template</label>
          <select name="setting_id" className="form-input">
            <option value="">Auto (best match)</option>
            {settings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.day_threshold} days — {s.tone}
              </option>
            ))}
          </select>
        </div>
      )}
      <SubmitBtn />
      {state.success && (
        <span className="text-sm text-green-600 font-medium self-end pb-0.5">Sent!</span>
      )}
      {state.error && (
        <span className="text-sm text-red-600 self-end pb-0.5">{state.error}</span>
      )}
    </form>
  );
}
