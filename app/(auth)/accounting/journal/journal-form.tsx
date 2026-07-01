'use client';

import DatePicker from '@/components/date-picker';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { createJournalEntryAction } from './actions';
import type { ActionResult } from '@/types';

interface Account { id: string; account_code: string; account_name: string; }
interface JournalLine { accountCode: string; debit: string; credit: string; }

const INIT: ActionResult = { success: false, error: '' };

function SubmitBtn({ balanced }: { balanced: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !balanced}
      className="rounded-full bg-purple-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-40 transition-colors"
    >
      {pending ? 'Posting…' : 'Post Entry'}
    </button>
  );
}

export default function JournalForm({ accounts }: { accounts: Account[] }) {
  const [state, action] = useFormState(createJournalEntryAction, INIT);
  const today = new Date().toISOString().slice(0, 10);
  const [lines, setLines] = useState<JournalLine[]>([
    { accountCode: '', debit: '', credit: '' },
    { accountCode: '', debit: '', credit: '' },
  ]);

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const diff        = Math.abs(totalDebit - totalCredit);

  const updateLine = (i: number, field: keyof JournalLine, val: string) => {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  };

  const addLine = () => setLines((prev) => [...prev, { accountCode: '', debit: '', credit: '' }]);
  const removeLine = (i: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = (fd: FormData) => {
    fd.set('payload', JSON.stringify({
      entryDate:   fd.get('entryDate'),
      description: fd.get('description'),
      lines: lines
        .filter((l) => l.accountCode)
        .map((l) => ({
          accountCode: l.accountCode,
          debit:  parseFloat(l.debit)  || 0,
          credit: parseFloat(l.credit) || 0,
        })),
    }));
    return action(fd);
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Entry Details */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">Entry Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Entry Date</label>
            <DatePicker name="entryDate" defaultValue={today} required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Narration</label>
            <textarea
              name="description"
              rows={3}
              placeholder="e.g. Cash received from customer for invoice INV/2026-27/0001"
              required
              className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
            />
          </div>
        </div>
      </div>

      {/* Journal Lines */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-6 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Journal Lines</h2>
          <p className="mt-0.5 text-xs text-gray-400">Debit total must equal Credit total before you can post.</p>
        </div>
        <div className="overflow-x-auto border-t border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left border-b-2 border-gray-200">
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Account</th>
                <th className="px-3 py-3 w-40 text-xs font-semibold text-gray-600 uppercase tracking-wide text-right">Debit (₹)</th>
                <th className="px-3 py-3 w-40 text-xs font-semibold text-gray-600 uppercase tracking-wide text-right">Credit (₹)</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lines.map((line, i) => (
                <tr key={i} className={`${i % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'} hover:bg-purple-50/30 transition-colors`}>
                  <td className="px-4 py-3">
                    <select
                      value={line.accountCode}
                      onChange={(e) => updateLine(i, 'accountCode', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
                    >
                      <option value="">— select account —</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.account_code}>
                          {a.account_code} — {a.account_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={line.debit}
                      onChange={(e) => updateLine(i, 'debit', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-right tabular-nums text-gray-800 placeholder-gray-300 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={line.credit}
                      onChange={(e) => updateLine(i, 'credit', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-right tabular-nums text-gray-800 placeholder-gray-300 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      title="Remove line"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors text-lg leading-none"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-100">
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">Totals</td>
                <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">
                  <span className={totalDebit > 0 ? 'text-gray-900' : 'text-gray-400'}>
                    ₹{totalDebit.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">
                  <span className={totalCredit > 0 ? 'text-gray-900' : 'text-gray-400'}>
                    ₹{totalCredit.toFixed(2)}
                  </span>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Balance indicator — prominent badge below table */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={addLine}
            className="rounded-full border border-purple-500 px-4 py-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 transition-colors"
          >
            + Add Line
          </button>
          {balanced ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2">
              <span className="text-green-600 font-bold">✓</span>
              <span className="text-sm font-semibold text-green-700">Entry balances</span>
            </div>
          ) : totalDebit > 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2">
              <span className="text-red-500 font-bold">⚠</span>
              <span className="text-sm font-medium text-red-700">
                Off by ₹{diff.toFixed(2)} — must balance to post
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SubmitBtn balanced={balanced} />
        <a
          href="/accounting/journal"
          className="rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
