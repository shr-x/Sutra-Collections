'use client';

import { useState, useTransition } from 'react';
import { runPayrollAction, updateBaseSalaryAction } from './actions';
import { formatInr } from '@/lib/gst';

interface StaffRow {
  id: string;
  name: string;
  email: string;
  base_salary: number;
}

interface AttendanceSummary {
  userId: string;
  present: number;
  halfDays: number;
  absent: number;
  leave: number;
}

interface PayrollRun {
  userId: string;
  month: number;
  year: number;
  amount_paid: number;
  days_present: number;
}

interface Props {
  staff: StaffRow[];
  attendance: AttendanceSummary[];
  existingRuns: PayrollRun[];
  year: number;
  month: number;
  totalDays: number;
}

function calcAmount(base: number, daysPresent: number, halfDays: number, totalDays: number): number {
  if (totalDays === 0) return 0;
  const effective = daysPresent + halfDays * 0.5;
  return parseFloat(((base / totalDays) * effective).toFixed(2));
}

export default function PayrollClient({
  staff, attendance, existingRuns, year, month, totalDays,
}: Props) {
  const [salaries, setSalaries]   = useState<Record<string, number>>(
    Object.fromEntries(staff.map((s) => [s.id, s.base_salary]))
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal]     = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank'>('cash');
  const [confirming, setConfirming]   = useState(false);
  const [result, setResult]           = useState<{ saved: number; errors: string[] } | null>(null);
  const [, startTransition]           = useTransition();

  const attMap = Object.fromEntries(attendance.map((a) => [a.userId, a]));
  const runsMap = Object.fromEntries(existingRuns.map((r) => [r.userId, r]));

  const monthLabel = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const saveBaseSalary = async (userId: string, val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setSalaries((s) => ({ ...s, [userId]: num }));
    setEditingId(null);
    startTransition(() => {
      void updateBaseSalaryAction(userId, num);
    });
  };

  const entries = staff.map((s) => {
    const att   = attMap[s.id] ?? { present: 0, halfDays: 0, absent: 0, leave: 0 };
    const base  = salaries[s.id] ?? 0;
    const amount = calcAmount(base, att.present, att.halfDays, totalDays);
    return { userId: s.id, baseSalary: base, daysPresent: att.present, halfDays: att.halfDays,
             totalDays, amountPaid: amount };
  }).filter((e) => e.amountPaid > 0);

  const totalPayout = entries.reduce((sum, e) => sum + e.amountPaid, 0);

  const handleRun = async () => {
    setConfirming(false);
    const res = await runPayrollAction({ month, year, paymentMode, entries });
    setResult(res);
  };

  if (result) {
    return (
      <div className="max-w-md mx-auto text-center card">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-lg font-bold mb-1">Payroll Posted</h2>
        <p className="text-sm text-gray-500 mb-4">{result.saved} expense entries created for {monthLabel}</p>
        {result.errors.length > 0 && (
          <div className="text-left text-xs text-red-600 bg-red-50 rounded p-3 mb-4">
            {result.errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
        <button onClick={() => setResult(null)} className="btn-secondary">Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Month label */}
      <div className="flex items-center gap-4">
        <h2 className="font-semibold text-gray-800">{monthLabel}</h2>
        <span className="text-xs text-gray-400">{totalDays} calendar days</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600">Pay via:</label>
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as 'cash' | 'bank')}
            className="input w-28 text-sm py-1"
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
          </select>
        </div>
      </div>

      {/* Staff table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Staff</th>
              <th className="px-4 py-3 text-right">Base Salary ₹</th>
              <th className="px-4 py-3 text-center">Present</th>
              <th className="px-4 py-3 text-center">Half Days</th>
              <th className="px-4 py-3 text-right">Net Amount ₹</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staff.map((s) => {
              const att    = attMap[s.id] ?? { present: 0, halfDays: 0, absent: 0, leave: 0 };
              const base   = salaries[s.id] ?? 0;
              const amount = calcAmount(base, att.present, att.halfDays, totalDays);
              const done   = runsMap[s.id];
              const editing = editingId === s.id;

              return (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.email}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editing ? (
                      <input
                        autoFocus
                        type="number"
                        defaultValue={base}
                        className="w-28 input text-right text-sm py-1"
                        onBlur={(e) => saveBaseSalary(s.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingId(s.id); setEditVal(String(base)); }}
                        className="text-right hover:text-purple-600 hover:underline"
                        title="Click to edit base salary"
                      >
                        {formatInr(base)}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{att.present}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{att.halfDays}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {base > 0 ? formatInr(amount) : <span className="text-gray-300 text-xs">Set salary</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {done ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 font-medium">
                        Paid {formatInr(done.amount_paid)}
                      </span>
                    ) : base === 0 ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-medium">
                        Pending
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-700">Total Payout:</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">{formatInr(totalPayout)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Run payroll */}
      {entries.length > 0 && (
        <div className="flex justify-end">
          {confirming ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                This will post {formatInr(totalPayout)} as salary expense. Confirm?
              </span>
              <button onClick={() => setConfirming(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={() => void handleRun()} className="btn-primary text-sm">Yes, Run Payroll</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="btn-primary"
              disabled={entries.length === 0}
            >
              Run Payroll for {monthLabel}
            </button>
          )}
        </div>
      )}

      {staff.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-12">
          No active staff. Add users with a salary in Settings → Users.
        </p>
      )}
    </div>
  );
}
