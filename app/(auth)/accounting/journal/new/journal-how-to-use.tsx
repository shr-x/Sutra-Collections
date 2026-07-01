'use client';

import { useState } from 'react';

const RULES = [
  ['Asset',            'Increase ↑', 'Decrease ↓'],
  ['Liability',        'Decrease ↓', 'Increase ↑'],
  ['Income / Revenue', 'Decrease ↓', 'Increase ↑'],
  ['Expense',          'Increase ↑', 'Decrease ↓'],
  ['Equity / Capital', 'Decrease ↓', 'Increase ↑'],
] as const;

const EXAMPLES = [
  {
    title: 'Cash received from customer',
    lines: [
      { account: '1001 — Cash / Bank', dr: '₹5,000', cr: '' },
      { account: '1200 — Accounts Receivable', dr: '', cr: '₹5,000' },
    ],
  },
  {
    title: 'Paid electricity bill in cash',
    lines: [
      { account: '5100 — Utilities Expense', dr: '₹1,200', cr: '' },
      { account: '1001 — Cash / Bank', dr: '', cr: '₹1,200' },
    ],
  },
  {
    title: 'Purchased fabric on credit from supplier',
    lines: [
      { account: '1500 — Inventory / Raw Material', dr: '₹8,000', cr: '' },
      { account: '2100 — Accounts Payable', dr: '', cr: '₹8,000' },
    ],
  },
];

export default function JournalHowToUse() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-amber-100/60 transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-lg">💡</span>
          <span className="font-semibold text-amber-900 text-sm">How to use Journal Entry</span>
        </span>
        <span className="text-amber-600 text-xl font-light leading-none select-none">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-amber-200 px-5 pb-6 pt-5 space-y-6">
          {/* Golden rules table */}
          <div>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3">Golden Rules</p>
            <div className="rounded-lg overflow-hidden border border-amber-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-amber-100 border-b border-amber-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-amber-800">Account Type</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-amber-800 w-32">Debit means</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-amber-800 w-32">Credit means</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-amber-100">
                  {RULES.map(([type, dr, cr]) => (
                    <tr key={type}>
                      <td className="px-4 py-2.5 font-medium text-gray-700">{type}</td>
                      <td className="px-3 py-2.5 text-center text-green-700 font-medium">{dr}</td>
                      <td className="px-3 py-2.5 text-center text-red-600 font-medium">{cr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Examples */}
          <div>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3">Common Examples</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {EXAMPLES.map((eg) => (
                <div key={eg.title} className="rounded-lg bg-white border border-amber-200 overflow-hidden">
                  <div className="px-3 py-2.5 bg-amber-50 border-b border-amber-200">
                    <p className="text-xs font-semibold text-amber-800">{eg.title}</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-amber-100">
                        <th className="px-3 py-1.5 text-left font-medium text-gray-500">Account</th>
                        <th className="px-2 py-1.5 text-right font-medium text-gray-500 w-16">Dr</th>
                        <th className="px-3 py-1.5 text-right font-medium text-gray-500 w-16">Cr</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-50">
                      {eg.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-gray-700">{l.account}</td>
                          <td className={`px-2 py-2 text-right tabular-nums font-medium ${l.dr ? 'text-green-700' : 'text-gray-300'}`}>
                            {l.dr || '—'}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${l.cr ? 'text-red-600' : 'text-gray-300'}`}>
                            {l.cr || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-amber-700">
            Every entry must balance — total Debit = total Credit. The system enforces this before posting.
          </p>
        </div>
      )}
    </div>
  );
}
