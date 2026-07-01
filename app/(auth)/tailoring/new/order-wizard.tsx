'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DatePicker from '@/components/date-picker';
import FabricCombobox from './fabric-combobox';
import { createTailoringOrder, createCustomerInline, sendBatchConfirmationAction } from '../actions';

// ── Types ──────────────────────────────────────────────────────────────────

interface Field {
  id: string;
  field_name: string;
  field_type: 'number' | 'text';
  unit: string | null;
  sort_order: number;
}

interface DesignOption {
  id: string;
  name: string;
  category: string | null;
  photo_path: string | null;
  fields: Field[];
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
}

interface MeasurementVersion {
  id: string;
  version_number: number;
  created_at: string;
  taken_by_name: string | null;
  values: Array<{ field_id: string; value: string }>;
}

interface Props {
  designs: DesignOption[];
  customers: CustomerOption[];
  initialDesignId?: string;
}

// ── Step indicator ─────────────────────────────────────────────────────────

const STEPS = ['Design', 'Customer', 'Measurements', 'Details & Save'];

function StepBar({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const n    = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={n} className="flex items-center flex-1">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold border-2 ${
              done   ? 'bg-purple-600 border-purple-600 text-white' :
              active ? 'bg-white border-purple-600 text-purple-700' :
                       'bg-white border-gray-300 text-gray-400'
            }`}>
              {done ? '✓' : n}
            </div>
            <span className={`ml-2 text-xs font-medium hidden sm:block ${active ? 'text-purple-700' : done ? 'text-gray-600' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${done ? 'bg-purple-600' : 'bg-gray-200'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────

export default function OrderWizard({ designs, customers, initialDesignId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Wizard state
  const [step, setStep]                   = useState<1 | 2 | 3 | 4>(1);
  const [design, setDesign]               = useState<DesignOption | null>(
    () => designs.find((d) => d.id === initialDesignId) ?? null
  );
  const [customer, setCustomer]           = useState<CustomerOption | null>(null);
  const [measurements, setMeasurements]   = useState<Record<string, string>>({});
  const [prevVersions, setPrevVersions]   = useState<MeasurementVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [colorFabric, setColorFabric]     = useState('');
  const [price, setPrice]                 = useState('');
  const [dueDate, setDueDate]             = useState('');
  const [notes, setNotes]                 = useState('');
  const [submitError, setSubmitError]     = useState<string | null>(null);

  // Batch session state
  const [batchId, setBatchId]             = useState<string | null>(null);
  const [batchCount, setBatchCount]       = useState(0);
  const [lockedCustomer, setLockedCustomer] = useState<CustomerOption | null>(null);

  // Customer search / create state
  const [custSearch, setCustSearch]       = useState('');
  const [showNewCust, setShowNewCust]     = useState(false);
  const [newCustName, setNewCustName]     = useState('');
  const [newCustPhone, setNewCustPhone]   = useState('');
  const [newCustError, setNewCustError]   = useState<string | null>(null);
  const [newCustPending, startCustTrans]  = useTransition();

  // Advance to step 2 automatically if initialDesign provided
  useEffect(() => {
    if (initialDesignId && designs.find((d) => d.id === initialDesignId)) {
      setStep(2);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // In batch mode: skip step 2 (customer already locked) when design is chosen
  function handleDesignSelect(d: DesignOption) {
    setDesign(d);
    setMeasurements({});
    if (lockedCustomer) {
      setCustomer(lockedCustomer);
      setStep(3);
    } else {
      setStep(2);
    }
  }

  // Fetch measurement history when entering step 3; auto-fill latest version
  useEffect(() => {
    if (step !== 3 || !customer || !design) return;
    setLoadingVersions(true);
    fetch(`/api/tailoring/measurement-history?customer_id=${customer.id}&design_id=${design.id}`)
      .then((r) => r.json())
      .then((data: { versions?: MeasurementVersion[] }) => {
        const versions = data.versions ?? [];
        setPrevVersions(versions);
        if (versions.length > 0) loadVersion(versions[0]);
      })
      .catch(() => setPrevVersions([]))
      .finally(() => setLoadingVersions(false));
  }, [step, customer?.id, design?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  function loadVersion(v: MeasurementVersion) {
    const vals: Record<string, string> = {};
    v.values.forEach(({ field_id, value }) => { vals[field_id] = value; });
    setMeasurements(vals);
  }

  function handleCreateCustomer() {
    setNewCustError(null);
    startCustTrans(async () => {
      const result = await createCustomerInline({ name: newCustName, phone: newCustPhone });
      if (result.success && result.customer) {
        setCustomer(result.customer);
        setShowNewCust(false);
        setStep(3);
      } else {
        setNewCustError(result.error ?? 'Failed to create customer.');
      }
    });
  }

  function resetItemFields() {
    setDesign(null);
    setMeasurements({});
    setPrevVersions([]);
    setColorFabric('');
    setPrice('');
    setDueDate('');
    setNotes('');
    setSubmitError(null);
    setCustSearch('');
  }

  // Save current item and immediately start a new one for the same customer
  function handleSaveAndAddAnother() {
    if (!design || !customer) return;
    if (!dueDate) { setSubmitError('Due date is required.'); return; }
    setSubmitError(null);

    const currentBatchId = batchId ?? crypto.randomUUID();

    startTransition(async () => {
      const result = await createTailoringOrder({
        designId:        design.id,
        customerId:      customer.id,
        measurements,
        colorFabric:     colorFabric || undefined,
        price:           parseFloat(price) || 0,
        dueDate:         dueDate || null,
        notes:           notes || undefined,
        batchId:         currentBatchId,
        suppressWhatsApp: true,
      });

      if (result.success) {
        if (!batchId) setBatchId(currentBatchId);
        setBatchCount((prev) => prev + 1);
        setLockedCustomer(customer);
        resetItemFields();
        setStep(1);
      } else {
        setSubmitError(result.error ?? 'Failed to save order.');
      }
    });
  }

  // Final save — ends batch session (or saves a single order)
  function handleSubmit() {
    if (!design || !customer) return;
    if (!dueDate) { setSubmitError('Due date is required.'); return; }
    setSubmitError(null);

    const isBatch = batchId !== null;

    startTransition(async () => {
      const result = await createTailoringOrder({
        designId:        design.id,
        customerId:      customer.id,
        measurements,
        colorFabric:     colorFabric || undefined,
        price:           parseFloat(price) || 0,
        dueDate:         dueDate || null,
        notes:           notes || undefined,
        batchId:         batchId ?? undefined,
        suppressWhatsApp: isBatch, // suppress individual WA; batch confirmation fired below
      });

      if (result.success && result.orderId) {
        if (isBatch && batchId) {
          await sendBatchConfirmationAction(batchId);
        }
        router.push(`/tailoring/${result.orderId}`);
      } else {
        setSubmitError(result.error ?? 'Failed to save order.');
      }
    });
  }

  const filteredCustomers = customers.filter((c) =>
    custSearch.trim() === '' ||
    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
    (c.phone ?? '').includes(custSearch)
  );

  // ── Step 1: Design selection ────────────────────────────────────────────
  if (step === 1) {
    return (
      <div>
        <StepBar current={1} />

        {batchId && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <span className="text-base">🔗</span>
            <span>
              <strong>Batch booking</strong> — {batchCount} item{batchCount !== 1 ? 's' : ''} saved for{' '}
              <strong>{lockedCustomer?.name}</strong>. Select next design to continue.
            </span>
          </div>
        )}

        <h2 className="text-base font-semibold text-gray-900 mb-4">Select a Design</h2>
        {designs.length === 0 ? (
          <div className="card py-10 text-center text-gray-400">
            <p className="mb-2">No designs in the catalog yet.</p>
            <a href="/designs/new" className="text-purple-600 underline text-sm">Create a design first →</a>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {designs.map((d) => (
              <button
                key={d.id}
                onClick={() => handleDesignSelect(d)}
                className="card group flex flex-col gap-2 p-3 text-left hover:ring-2 hover:ring-purple-500 transition-all"
              >
                <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
                  {d.photo_path ? (
                    <img src={`/${d.photo_path}`} alt={d.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl text-gray-300">✂️</div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-purple-700 truncate">{d.name}</p>
                  {d.category && <p className="text-xs text-gray-400">{d.category}</p>}
                  <p className="text-xs text-gray-400">{d.fields.length} field{d.fields.length !== 1 ? 's' : ''}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Step 2: Customer selection ──────────────────────────────────────────
  if (step === 2) {
    return (
      <div>
        <StepBar current={2} />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Select Customer
            {design && <span className="ml-2 text-sm font-normal text-gray-500">— {design.name}</span>}
          </h2>
          <button onClick={() => setStep(1)} className="text-sm text-purple-600 hover:underline">
            ← Change Design
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Only customers with a phone number are shown (required for tailoring).</p>

        <div className="card space-y-4">
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={custSearch}
            onChange={(e) => setCustSearch(e.target.value)}
            className="input w-full"
          />

          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {filteredCustomers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No customers found.</p>
            ) : (
              filteredCustomers.slice(0, 50).map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setCustomer(c); setStep(3); }}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-purple-50 hover:text-purple-700 transition-colors"
                >
                  <span className="font-medium text-sm">{c.name}</span>
                  <span className="text-xs text-gray-400">{c.phone}</span>
                </button>
              ))
            )}
          </div>

          <div>
            {!showNewCust ? (
              <button
                onClick={() => setShowNewCust(true)}
                className="text-sm text-purple-600 hover:underline"
              >
                + New Customer
              </button>
            ) : (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                <p className="text-sm font-semibold text-gray-800">New Customer</p>
                {newCustError && <p className="text-sm text-red-600">{newCustError}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                    <input
                      type="text"
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      className="input w-full"
                      placeholder="Customer name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
                    <input
                      type="tel"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      className="input w-full"
                      placeholder="10-digit phone"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateCustomer}
                    disabled={newCustPending}
                    className="btn-primary text-sm"
                  >
                    {newCustPending ? 'Creating…' : 'Create & Select'}
                  </button>
                  <button
                    onClick={() => { setShowNewCust(false); setNewCustError(null); }}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Measurements ────────────────────────────────────────────────
  if (step === 3) {
    return (
      <div>
        <StepBar current={3} />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Measurements
            {design && <span className="ml-2 text-sm font-normal text-gray-500">— {design.name}</span>}
          </h2>
          <button
            onClick={() => {
              if (lockedCustomer) setStep(1); // in batch mode, go back to design
              else setStep(2);
            }}
            className="text-sm text-purple-600 hover:underline"
          >
            ← {lockedCustomer ? 'Change Design' : 'Change Customer'}
          </button>
        </div>
        {customer && (
          <p className="text-xs text-gray-500 mb-4">
            Customer: <span className="font-medium text-gray-700">{customer.name}</span>
            {' · '}{customer.phone}
            {lockedCustomer && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                🔗 Batch
              </span>
            )}
          </p>
        )}

        {loadingVersions && (
          <p className="text-xs text-gray-400 mb-2">Loading previous measurements…</p>
        )}
        {prevVersions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500">Load previous:</span>
            {prevVersions.slice(0, 5).map((v) => (
              <button
                key={v.id}
                onClick={() => loadVersion(v)}
                className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
              >
                v{v.version_number} · {new Date(v.created_at).toLocaleDateString('en-IN')}
              </button>
            ))}
          </div>
        )}

        {design && design.fields.length === 0 ? (
          <div className="card py-8 text-center text-gray-400 text-sm mb-4">
            This design has no measurement fields defined.
            <a href={`/designs/${design.id}`} className="block mt-1 text-purple-600 hover:underline">
              Add fields to this design →
            </a>
          </div>
        ) : (
          <div className="card space-y-4 mb-4">
            <p className="text-xs text-gray-500">Fill in measurements. Leave blank to skip.</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {design?.fields.map((field) => (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.field_name}
                    {field.unit && <span className="text-gray-400 font-normal"> ({field.unit})</span>}
                  </label>
                  <input
                    type={field.field_type === 'number' ? 'number' : 'text'}
                    step={field.field_type === 'number' ? '0.5' : undefined}
                    value={measurements[field.id] ?? ''}
                    onChange={(e) => setMeasurements((prev) => ({
                      ...prev,
                      [field.id]: e.target.value,
                    }))}
                    className="input w-full"
                    placeholder={field.field_type === 'number' ? '0.0' : ''}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button onClick={() => setStep(4)} className="btn-primary">
            Continue to Details →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 4: Order details + submit ──────────────────────────────────────
  return (
    <div>
      <StepBar current={4} />
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Order Details</h2>
        <button onClick={() => setStep(3)} className="text-sm text-purple-600 hover:underline">
          ← Back to Measurements
        </button>
      </div>

      {/* Batch indicator */}
      {batchId && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="text-base">🔗</span>
          <span>
            <strong>Batch booking</strong> — {batchCount} item{batchCount !== 1 ? 's' : ''} saved so far for{' '}
            <strong>{lockedCustomer?.name}</strong>. This will be item {batchCount + 1}.
          </span>
        </div>
      )}

      {/* Summary */}
      <div className="card bg-purple-50 border-purple-100 mb-4 text-sm">
        <div className="grid grid-cols-2 gap-y-1">
          <span className="text-gray-500">Design</span>
          <span className="font-medium">{design?.name}</span>
          <span className="text-gray-500">Customer</span>
          <span className="font-medium">{customer?.name} · {customer?.phone}</span>
          <span className="text-gray-500">Measurements</span>
          <span className="font-medium">
            {Object.values(measurements).filter(Boolean).length} value{Object.values(measurements).filter(Boolean).length !== 1 ? 's' : ''} entered
          </span>
        </div>
      </div>

      {submitError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color / Fabric</label>
          <FabricCombobox value={colorFabric} onChange={setColorFabric} />
          <p className="mt-1 text-xs text-gray-400">Recorded only — no stock deduction.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Price <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input w-full pl-7"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Due Date <span className="text-red-500">*</span>
          </label>
          <DatePicker
            value={dueDate}
            onChange={(v) => setDueDate(v)}
            className="input w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Required — customer will be notified by WhatsApp.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input w-full"
            placeholder="Special instructions, alterations, etc."
          />
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <button onClick={() => setStep(3)} className="btn-secondary sm:order-first">Back</button>

          {/* Save & Add Another — starts/continues a batch session */}
          <button
            onClick={handleSaveAndAddAnother}
            disabled={isPending || !price || !dueDate}
            className="btn-secondary flex items-center justify-center gap-1.5 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : (
              <>
                <span>🔗</span>
                <span>Save &amp; Add Another Item</span>
              </>
            )}
          </button>

          {/* Save Order — ends the session and navigates to detail */}
          <button
            onClick={handleSubmit}
            disabled={isPending || !price || !dueDate}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? 'Saving Order…' : batchId ? `Save Order (finish batch)` : 'Save Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
