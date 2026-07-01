'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { saveSASettingsAction } from './actions';

interface Setting {
  key: string;
  value: string;
}

const PREFIXES: Array<{ prefix: string; label: string }> = [
  { prefix: 'company_',   label: 'Company' },
  { prefix: 'whatsapp_',  label: 'WhatsApp' },
  { prefix: 'loyalty_',   label: 'Loyalty' },
  { prefix: 'reminder_',  label: 'Reminders' },
  { prefix: 'overdue_',   label: 'Overdue' },
  { prefix: 'upi_',       label: 'UPI' },
];

function groupSettings(settings: Setting[]): Array<{ label: string; items: Setting[] }> {
  const groups: Map<string, Setting[]> = new Map();

  // Pre-populate group order
  for (const { label } of PREFIXES) {
    groups.set(label, []);
  }
  groups.set('General', []);

  for (const s of settings) {
    const match = PREFIXES.find(({ prefix }) => s.key.startsWith(prefix));
    const label = match ? match.label : 'General';
    groups.get(label)!.push(s);
  }

  // Remove empty groups
  return Array.from(groups.entries())
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Save All Settings'}
    </button>
  );
}

export default function SettingsForm({ settings }: { settings: Setting[] }) {
  const [state, formAction] = useFormState(saveSASettingsAction, null);
  const groups = groupSettings(settings);

  return (
    <form action={formAction} className="space-y-6">
      {groups.map(({ label, items }) => (
        <div key={label} className="rounded-lg border border-gray-700 bg-gray-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">{label}</h2>
          <div className="space-y-3">
            {items.map((s) => (
              <div key={s.key} className="grid grid-cols-[2fr_3fr] items-center gap-4">
                <label className="break-all font-mono text-sm text-gray-400">{s.key}</label>
                <input
                  name={s.key}
                  type="text"
                  defaultValue={s.value}
                  className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {state?.error && (
        <p className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="rounded border border-green-700 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          Settings saved successfully.
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
