'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import DatePicker from '@/components/date-picker';
import { updateOrderAction } from '../actions';

interface Field {
  id: string;
  field_name: string;
  field_type: 'number' | 'text';
  unit: string | null;
}

interface VersionHistoryEntry {
  id: string;
  version_number: number;
  created_at: string;
  taken_by_name: string | null;
  values: Array<{ field_id: string; value: string }>;
}

export interface OrderDetailsPanelProps {
  orderId: string;
  status: string;
  // Editable
  currentColorFabric: string | null;
  currentNotes: string | null;
  currentDueDate: string | null;  // 'YYYY-MM-DD'
  fields: Field[];
  currentMeasurements: Record<string, string>; // field_id → value
  currentVersionNumber: number | null;
  // Display-only
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  designId: string;
  designName: string;
  designCategory: string | null;
  totalAmount: number;
}

const fmt = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n)}`;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

export default function OrderDetailsPanel(props: OrderDetailsPanelProps) {
  const router = useRouter();
  const {
    orderId, status,
    currentColorFabric, currentNotes, currentDueDate,
    fields, currentMeasurements, currentVersionNumber,
    customerId, customerName, customerPhone,
    designId, designName, designCategory, totalAmount,
  } = props;

  const canEdit = status === 'in_progress';

  const [editing, setEditing]           = useState(false);
  const [measurements, setMeasurements] = useState<Record<string, string>>(currentMeasurements);
  const [colorFabric, setColorFabric]   = useState(currentColorFabric ?? '');
  const [notes, setNotes]               = useState(currentNotes ?? '');
  const [dueDate, setDueDate]           = useState(currentDueDate ?? '');
  const [amount, setAmount]             = useState(String(totalAmount));
  const [error, setError]               = useState<string | null>(null);
  const [isPending, startTrans]         = useTransition();

  const [showHistory, setShowHistory]   = useState(false);
  const [history, setHistory]           = useState<VersionHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  function toggleHistory() {
    if (showHistory) { setShowHistory(false); return; }
    setShowHistory(true);
    if (history.length > 0) return; // already loaded
    setLoadingHistory(true);
    fetch(`/api/tailoring/measurement-history?customer_id=${customerId}&design_id=${designId}`)
      .then((r) => r.json() as Promise<{ versions?: VersionHistoryEntry[] }>)
      .then((d) => setHistory(d.versions ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }

  const fieldById = Object.fromEntries(fields.map((f) => [f.id, f]));

  function cancelEdit() {
    setEditing(false);
    setMeasurements(currentMeasurements);
    setColorFabric(currentColorFabric ?? '');
    setNotes(currentNotes ?? '');
    setDueDate(currentDueDate ?? '');
    setAmount(String(totalAmount));
    setError(null);
  }

  function handleSave() {
    setError(null);
    const parsedAmount = parseFloat(amount);
    if (!(parsedAmount >= 0)) {
      setError('Enter a valid total amount.');
      return;
    }
    startTrans(async () => {
      const res = await updateOrderAction({
        orderId,
        measurements,
        colorFabric: colorFabric || undefined,
        notes: notes || undefined,
        dueDate: dueDate || null,
        totalAmount: parsedAmount,
      });
      if (res.success) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error ?? 'Failed to save.');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Order Summary ── */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Order Summary</h2>
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-full border-2 border-purple-500 bg-purple-50 px-4 py-1.5 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100"
            >
              ✏️ Edit Order
            </button>
          )}
          {editing && (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="rounded-full bg-purple-600 px-4 py-1 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-40"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-gray-400">Customer</dt>
            <dd className="font-medium">
              <a href={`/customers/${customerId}`} className="text-purple-700 hover:underline">
                {customerName}
              </a>
            </dd>
            {customerPhone && <dd className="text-xs text-gray-400">{customerPhone}</dd>}
          </div>
          <div>
            <dt className="text-xs text-gray-400">Design</dt>
            <dd className="font-medium">
              <a href={`/designs/${designId}`} className="text-purple-700 hover:underline">
                {designName}
              </a>
            </dd>
            {designCategory && <dd className="text-xs text-gray-400">{designCategory}</dd>}
          </div>
          <div>
            <dt className="text-xs text-gray-400">Total Amount</dt>
            {editing ? (
              <dd className="mt-0.5">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="input w-full pl-7 text-sm py-1"
                  />
                </div>
              </dd>
            ) : (
              <dd className="text-lg font-bold text-gray-900">{fmt(totalAmount)}</dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-gray-400">Due Date</dt>
            {editing ? (
              <dd className="mt-0.5">
                <DatePicker value={dueDate} onChange={setDueDate} className="input w-full text-sm py-1" />
              </dd>
            ) : (
              <dd className="font-medium">{fmtDate(dueDate) ?? <span className="text-gray-400">—</span>}</dd>
            )}
          </div>

          <div className="col-span-2">
            <dt className="text-xs text-gray-400">Color / Fabric</dt>
            {editing ? (
              <input
                type="text"
                value={colorFabric}
                onChange={(e) => setColorFabric(e.target.value)}
                className="input mt-1 w-full text-sm"
                placeholder="e.g. Navy Blue Cotton, Raw Silk…"
              />
            ) : (
              <dd className="font-medium">{colorFabric || <span className="text-gray-400">—</span>}</dd>
            )}
          </div>

          <div className="col-span-2">
            <dt className="text-xs text-gray-400">Notes</dt>
            {editing ? (
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input mt-1 w-full text-sm"
                placeholder="Special instructions…"
              />
            ) : (
              <dd className="whitespace-pre-line text-gray-700">{notes || <span className="text-gray-400">—</span>}</dd>
            )}
          </div>
        </dl>
      </div>

      {/* ── Measurements ── */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Measurements
            {currentVersionNumber && (
              <span className="ml-2 text-xs font-normal text-gray-400">Version {currentVersionNumber} (current)</span>
            )}
          </h2>
          {currentVersionNumber && currentVersionNumber > 1 && (
            <button
              type="button"
              onClick={toggleHistory}
              className="text-xs text-purple-600 hover:underline"
            >
              {showHistory ? 'Hide history' : 'View history'}
            </button>
          )}
        </div>

        {showHistory && (
          <div className="mb-4 space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
            {loadingHistory ? (
              <p className="text-xs text-gray-400">Loading history…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-400">No version history found.</p>
            ) : (
              history.map((v) => (
                <div key={v.id} className="rounded-md border border-gray-200 bg-white px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">
                      Version {v.version_number}
                      {v.version_number === currentVersionNumber && (
                        <span className="ml-1.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">current</span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(v.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {v.taken_by_name ? ` · ${v.taken_by_name}` : ''}
                    </span>
                  </div>
                  {v.values.length === 0 ? (
                    <p className="text-xs text-gray-400">No values recorded.</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {v.values.map((val) => (
                        <div key={val.field_id} className="text-xs">
                          <span className="text-gray-500">{fieldById[val.field_id]?.field_name ?? '—'}: </span>
                          <span className="font-medium text-gray-800">
                            {val.value}{fieldById[val.field_id]?.unit ? ` ${fieldById[val.field_id].unit}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {fields.length === 0 ? (
          <p className="py-2 text-sm text-gray-400">No measurement fields defined for this design.</p>
        ) : editing ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {fields.map((f) => (
              <div key={f.id}>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {f.field_name}
                  {f.unit && <span className="font-normal text-gray-400"> ({f.unit})</span>}
                </label>
                <input
                  type={f.field_type === 'number' ? 'number' : 'text'}
                  step={f.field_type === 'number' ? '0.5' : undefined}
                  value={measurements[f.id] ?? ''}
                  onChange={(e) =>
                    setMeasurements((prev) => ({ ...prev, [f.id]: e.target.value }))
                  }
                  className="input w-full"
                  placeholder={f.field_type === 'number' ? '0.0' : ''}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {fields.map((f) => (
              <div key={f.id}>
                <dt className="text-xs text-gray-400">{f.field_name}</dt>
                <dd className="text-sm font-medium text-gray-800">
                  {currentMeasurements[f.id]
                    ? `${currentMeasurements[f.id]}${f.unit ? ` ${f.unit}` : ''}`
                    : <span className="text-gray-300">—</span>}
                </dd>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
