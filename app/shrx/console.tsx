'use client';

import { useCallback, useEffect, useState } from 'react';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
  });
  if (res.status === 401) { window.location.reload(); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function ErrorNote({ msg }: { msg: string }) {
  return msg ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p> : null;
}

const TABS = [
  ['wa', 'WhatsApp log'],
  ['errors', 'Failed updates'],
  ['users', 'Users'],
  ['delete', 'Delete orders'],
  ['dues', 'Clear dues'],
  ['audit', 'SHRX audit log'],
] as const;
type Tab = (typeof TABS)[number][0];

export default function ShrxConsole() {
  const [tab, setTab] = useState<Tab>('wa');
  async function logout() {
    await fetch('/api/shrx/logout', { method: 'POST' });
    window.location.reload();
  }
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">SHRX console</h1>
          <p className="text-xs text-gray-500">Session lasts 30 minutes. Every action is recorded in the SHRX audit log.</p>
        </div>
        <button type="button" onClick={logout} className="btn-secondary text-sm">Log out</button>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'wa' && <WhatsAppLog />}
      {tab === 'errors' && <FailedUpdates />}
      {tab === 'users' && <Users />}
      {tab === 'delete' && <DeleteOrders />}
      {tab === 'dues' && <ClearDues />}
      {tab === 'audit' && <AuditLog />}
    </div>
  );
}

// ─── WhatsApp log ─────────────────────────────────────────────────────────────

interface WaRow {
  id: string; created_at: string; customer_id: string | null; customer_name: string | null; phone: string;
  template_name: string; status: 'sent' | 'failed' | 'skipped'; error_code: string | null; error_message: string | null;
  entity_type: string | null; entity_id: string | null; entity_label: string | null;
}

function entityHref(type: string | null, id: string | null): string | null {
  if (!id) return null;
  if (type === 'invoice') return `/billing/invoices/${id}`;
  if (type === 'tailoring_order') return `/tailoring/${id}`;
  if (type === 'credit_note') return `/billing/credit-notes/${id}`;
  return null;
}

function WhatsAppLog() {
  const [f, setF] = useState({ status: '', from: '', to: '', template: '', customer: '' });
  const [rows, setRows] = useState<WaRow[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
      const d = await api<{ rows: WaRow[]; templates: string[] }>(`/api/shrx/whatsapp-log?${qs}`);
      setRows(d.rows); setTemplates(d.templates);
    } catch (e) { setErr((e as Error).message); }
  }, [f]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600">Status
          <select className="input mt-1 text-sm" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">All</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="skipped">Skipped</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">From<input type="date" className="input mt-1 text-sm" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="text-xs text-gray-600">To<input type="date" className="input mt-1 text-sm" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <label className="text-xs text-gray-600">Template
          <select className="input mt-1 text-sm" value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}>
            <option value="">All</option>{templates.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">Customer<input className="input mt-1 text-sm" placeholder="Name or phone" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} /></label>
        <button type="button" onClick={load} className="btn-primary btn-sm">Apply</button>
      </div>
      <ErrorNote msg={err} />
      <div className="card overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Meta error</th><th className="px-3 py-2">Related</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No messages logged.</td></tr>}
            {rows.map((r) => {
              const href = entityHref(r.entity_type, r.entity_id);
              return (
                <tr key={r.id} className={r.status === 'failed' ? 'bg-red-50' : r.status === 'skipped' ? 'bg-amber-50' : ''}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{dt(r.created_at)}</td>
                  <td className="px-3 py-2">
                    <div>{r.customer_id ? <a className="text-purple-700 hover:underline" href={`/customers/${r.customer_id}`}>{r.customer_name ?? 'Customer'}</a> : <span className="text-gray-400">—</span>}</div>
                    <div className="text-xs text-gray-500">{r.phone}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.template_name}</td>
                  <td className={`px-3 py-2 font-semibold capitalize ${r.status === 'failed' ? 'text-red-700' : r.status === 'skipped' ? 'text-amber-700' : 'text-green-700'}`}>{r.status}</td>
                  <td className="max-w-xs px-3 py-2 text-xs">{r.error_code && <span className="font-mono">#{r.error_code} </span>}{r.error_message}</td>
                  <td className="px-3 py-2 text-xs">{r.entity_label ? (href ? <a className="font-mono text-purple-700 hover:underline" href={href}>{r.entity_label}</a> : <span className="font-mono">{r.entity_label}</span>) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Failed updates ───────────────────────────────────────────────────────────

function FailedUpdates() {
  const [rows, setRows] = useState<Array<{ id: string; created_at: string; context: string; entity_type: string | null; entity_id: string | null; message: string; details: unknown }>>([]);
  const [err, setErr] = useState('');
  useEffect(() => { api<{ rows: typeof rows }>('/api/shrx/errors').then((d) => setRows(d.rows)).catch((e) => setErr(e.message)); }, []);
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">Errors from background sync steps that don&apos;t stop the main action (payment ↔ invoice sync, tailoring invoice create/amend, journal posting).</p>
      <ErrorNote msg={err} />
      <div className="card overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Where</th><th className="px-3 py-2">Record</th><th className="px-3 py-2">Error</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">No failed updates.</td></tr>}
            {rows.map((r) => {
              const href = entityHref(r.entity_type, r.entity_id);
              return (
                <tr key={r.id} className="bg-red-50/50">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{dt(r.created_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.context}</td>
                  <td className="px-3 py-2 text-xs">{href ? <a className="text-purple-700 hover:underline" href={href}>{r.entity_type}</a> : (r.entity_type ?? '—')}</td>
                  <td className="px-3 py-2 text-xs text-red-800">{r.message}{r.details ? <pre className="mt-1 whitespace-pre-wrap text-[10px] text-gray-500">{JSON.stringify(r.details)}</pre> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────

interface UserRow { id: string; name: string; email: string; role: string; is_active: boolean; created_at: string; warehouse_name: string | null }

function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', password: '', warehouse_id: '' });
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [resetPw, setResetPw] = useState('');

  const load = useCallback(() => {
    api<{ users: UserRow[]; warehouses: Array<{ id: string; name: string }> }>('/api/shrx/users')
      .then((d) => { setUsers(d.users); setWarehouses(d.warehouses); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  async function act(u: UserRow, body: Record<string, string>, done: string) {
    setErr(''); setMsg('');
    try { await api(`/api/shrx/users/${u.id}`, { method: 'POST', body: JSON.stringify(body) }); setMsg(done); load(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api('/api/shrx/users', { method: 'POST', body: JSON.stringify({ ...form, warehouse_id: form.warehouse_id || null }) });
      setMsg(`Created ${form.email}. Share the temporary password with them privately.`);
      setForm({ name: '', email: '', role: 'staff', password: '', warehouse_id: '' }); load();
    } catch (e2) { setErr((e2 as Error).message); }
  }

  const active = users.filter((u) => u.is_active);
  const inactive = users.filter((u) => !u.is_active);
  const table = (list: UserRow[], isActive: boolean) => (
    <div className="card overflow-x-auto p-0">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Warehouse</th><th className="px-3 py-2 text-right">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {list.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">None</td></tr>}
          {list.map((u) => (
            <tr key={u.id} className={isActive ? '' : 'text-gray-400'}>
              <td className="px-3 py-2">{u.name}</td><td className="px-3 py-2">{u.email}</td>
              <td className="px-3 py-2 capitalize">{u.role}</td><td className="px-3 py-2">{u.warehouse_name ?? '—'}</td>
              <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                <button type="button" className="btn-ghost btn-sm" onClick={() => { setResetFor(u); setResetPw(''); }}>Reset password</button>
                {isActive
                  ? <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => confirm(`Deactivate ${u.email}? They are signed out immediately.`) && act(u, { action: 'deactivate' }, `${u.email} deactivated.`)}>Deactivate</button>
                  : <button type="button" className="btn-ghost btn-sm text-green-700" onClick={() => act(u, { action: 'reactivate' }, `${u.email} reactivated.`)}>Reactivate</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <ErrorNote msg={err} />
      {msg && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p>}
      <form onSubmit={create} className="card grid gap-2 sm:grid-cols-6 sm:items-end">
        <h3 className="text-sm font-semibold sm:col-span-6">Add user</h3>
        <input className="input text-sm sm:col-span-1" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="input text-sm sm:col-span-2" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <select className="input text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="staff">Staff</option><option value="accountant">Accountant</option><option value="admin">Admin</option>
        </select>
        {form.role === 'staff'
          ? <select className="input text-sm" value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} required>
              <option value="">Warehouse…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          : <span />}
        <input className="input text-sm" placeholder="Temporary password" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        <button type="submit" className="btn-primary btn-sm sm:col-span-6 sm:justify-self-start">Create user</button>
      </form>
      <h3 className="text-sm font-semibold text-gray-700">Active ({active.length})</h3>
      {table(active, true)}
      <h3 className="text-sm font-semibold text-gray-700">Deactivated ({inactive.length})</h3>
      {table(inactive, false)}
      <p className="text-xs text-gray-400">Users are never deleted (invoices and other records point to them). The last active admin can&apos;t be deactivated.</p>

      {resetFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form className="card w-full max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); act(resetFor, { action: 'reset_password', password: resetPw }, `Password reset for ${resetFor.email}.`); setResetFor(null); }}>
            <h3 className="font-semibold">Reset password — {resetFor.email}</h3>
            <input className="input w-full" type="text" autoComplete="off" placeholder="New temporary password (8+ chars)" value={resetPw} onChange={(e) => setResetPw(e.target.value)} minLength={8} required />
            <p className="text-xs text-gray-500">They are signed out everywhere and log in with this password.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setResetFor(null)}>Cancel</button>
              <button type="submit" className="btn-primary btn-sm">Reset</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Delete orders ────────────────────────────────────────────────────────────

interface Plan {
  kind: 'invoice' | 'tailoring_order'; id: string; number: string; customerName: string | null; blockers: string[];
  invoices: Array<{ id: string; number: string; source: string; status: string; total: number; paid: number; role: string }>;
  detachOrders: string[]; keptSharedInvoice: string | null;
  order: { payments: number; paymentsTotal: number; alterations: number; total: number; paid: number } | null;
  stockRestore: Array<{ item: string; variant: string; quantity: number; invoice: string }>;
  journalEntries: number; loyaltyPointsReversed: number; storeCreditReturned: number;
  quotationsUnlinked: string[]; stockMovementsRemoved: number;
}

function DeleteOrders() {
  const [kind, setKind] = useState<'invoice' | 'tailoring_order'>('invoice');
  const [number, setNumber] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function preview(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setDone(''); setPlan(null); setTyped('');
    try { setPlan((await api<{ plan: Plan }>(`/api/shrx/delete?kind=${kind}&number=${encodeURIComponent(number.trim())}`)).plan); }
    catch (e2) { setErr((e2 as Error).message); }
  }
  async function execute() {
    if (!plan) return;
    setBusy(true); setErr('');
    try {
      await api('/api/shrx/delete', { method: 'POST', body: JSON.stringify({ kind, number: plan.number, confirm: typed }) });
      setDone(`${plan.number} deleted and all its effects undone.`); setPlan(null); setNumber(''); setTyped('');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        <strong>This cannot be undone.</strong> Deleting removes the record permanently and reverses its stock, dues, store credit,
        loyalty points, journal entries and payments. Take a database backup (pg_dump) first if you might need it back.
      </div>
      <form onSubmit={preview} className="card flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600">Type
          <select className="input mt-1 text-sm" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setPlan(null); }}>
            <option value="invoice">Invoice (retail or tailoring)</option><option value="tailoring_order">Tailoring order</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">Number
          <input className="input mt-1 font-mono text-sm" placeholder={kind === 'invoice' ? 'INV/2026-27/0001' : 'TO/2026-27/0001-A'} value={number} onChange={(e) => setNumber(e.target.value)} required />
        </label>
        <button type="submit" className="btn-secondary btn-sm">Preview</button>
      </form>
      <ErrorNote msg={err} />
      {done && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{done}</p>}

      {plan && (
        <div className="card space-y-3 text-sm">
          <h3 className="font-semibold">{plan.number} {plan.customerName ? `— ${plan.customerName}` : ''}</h3>
          {plan.blockers.length > 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
              <p className="font-semibold">Can&apos;t delete yet:</p>
              <ul className="list-disc pl-5">{plan.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}
          <ul className="list-disc space-y-1 pl-5 text-gray-700">
            {plan.order && <li>Order deleted with its {plan.order.payments} payment(s) ({inr(plan.order.paymentsTotal)}) and {plan.order.alterations} alteration(s). Order total {inr(plan.order.total)}, paid {inr(plan.order.paid)}.</li>}
            {plan.invoices.map((i) => <li key={i.id}>Invoice <span className="font-mono">{i.number}</span> ({i.role}, {i.source === 'tailoring' ? 'tailoring' : 'retail'}, {i.status}) — total {inr(i.total)}, paid {inr(i.paid)}</li>)}
            {plan.keptSharedInvoice && <li>Invoice <span className="font-mono">{plan.keptSharedInvoice}</span> is shared with other orders and is kept.</li>}
            {plan.detachOrders.length > 0 && <li>Order(s) {plan.detachOrders.join(', ')} kept, unlinked from the invoice.</li>}
            <li>Stock put back: {plan.stockRestore.length ? plan.stockRestore.map((s) => `${s.quantity} × ${s.item} (${s.variant})`).join(', ') : 'none'}</li>
            <li>Journal entries removed: {plan.journalEntries}</li>
            <li>Loyalty points reversed: {plan.loyaltyPointsReversed}</li>
            <li>Store credit given back: {inr(plan.storeCreditReturned)}</li>
            {plan.quotationsUnlinked.length > 0 && <li>Quotation(s) unlinked: {plan.quotationsUnlinked.join(', ')}</li>}
            <li>Stock movement rows removed: {plan.stockMovementsRemoved}</li>
          </ul>
          {plan.blockers.length === 0 && (
            <div className="space-y-2 border-t pt-3">
              <label className="block text-xs text-gray-600">Type <span className="font-mono font-semibold">{plan.number}</span> to confirm
                <input className="input mt-1 w-full font-mono text-sm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </label>
              <button type="button" disabled={typed !== plan.number || busy} onClick={execute}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
                {busy ? 'Deleting…' : `Delete ${plan.number} permanently`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Clear dues ───────────────────────────────────────────────────────────────

interface DueInv { id: string; invoice_number: string; invoice_date: string; source: string; grand_total: number; amount_paid: number; balance: number; order_numbers: string | null }

function ClearDues() {
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string | null; outstanding: number }>>([]);
  const [sel, setSel] = useState<{ id: string; name: string } | null>(null);
  const [dues, setDues] = useState<{ invoices: DueInv[]; uninvoicedOrders: Array<{ order_number: string; status: string; balance: number }> } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (q.trim().length < 2) { setCustomers([]); return; }
    const t = setTimeout(() => api<{ customers: typeof customers }>(`/api/shrx/dues?q=${encodeURIComponent(q)}`).then((d) => setCustomers(d.customers)).catch((e) => setErr(e.message)), 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadDues = useCallback(async (id: string) => {
    const d = await api<{ invoices: DueInv[]; uninvoicedOrders: Array<{ order_number: string; status: string; balance: number }> }>(`/api/shrx/dues/${id}`);
    setDues(d); setPicked(new Set());
  }, []);

  async function clear(ids: string[] | 'all') {
    if (!sel) return;
    const n = ids === 'all' ? dues?.invoices.length ?? 0 : ids.length;
    if (!confirm(`Silently mark ${n} invoice(s) of ${sel.name} as fully paid? No WhatsApp message is sent.`)) return;
    setErr(''); setMsg('');
    try {
      const r = await api<{ cleared: Array<{ invoice_number: string; amount: number }> }>('/api/shrx/dues', { method: 'POST', body: JSON.stringify({ customerId: sel.id, invoiceIds: ids }) });
      setMsg(`Cleared ${r.cleared.length} invoice(s): ${r.cleared.map((c) => `${c.invoice_number} (${inr(c.amount)})`).join(', ') || 'nothing outstanding'}.`);
      await loadDues(sel.id);
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <input className="input w-full" placeholder="Search customer by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        {customers.length > 0 && (
          <div className="mt-2 divide-y rounded-lg border">
            {customers.map((c) => (
              <button key={c.id} type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-purple-50"
                onClick={() => { setSel({ id: c.id, name: c.name }); setCustomers([]); setQ(''); setMsg(''); loadDues(c.id).catch((e) => setErr(e.message)); }}>
                <span>{c.name} <span className="text-xs text-gray-500">{c.phone}</span></span>
                <span className={c.outstanding > 0 ? 'font-semibold text-red-700' : 'text-gray-400'}>{inr(c.outstanding)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <ErrorNote msg={err} />
      {msg && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p>}
      {sel && dues && (
        <div className="card space-y-3 text-sm">
          <h3 className="font-semibold">{sel.name}</h3>
          {dues.invoices.length === 0 ? <p className="text-gray-500">No outstanding invoices.</p> : (
            <>
              <table className="min-w-full">
                <thead className="border-b text-left text-xs uppercase text-gray-500">
                  <tr><th className="py-1" /><th className="py-1">Invoice</th><th className="py-1">Date</th><th className="py-1">Type</th><th className="py-1 text-right">Total</th><th className="py-1 text-right">Paid</th><th className="py-1 text-right">Balance</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dues.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="py-1.5"><input type="checkbox" checked={picked.has(i.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(i.id); else n.delete(i.id); setPicked(n); }} /></td>
                      <td className="py-1.5 font-mono">{i.invoice_number}{i.order_numbers && <div className="text-[11px] text-gray-500">{i.order_numbers}</div>}</td>
                      <td className="py-1.5">{new Date(i.invoice_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-1.5">{i.source === 'tailoring' ? 'Tailoring' : 'Retail'}</td>
                      <td className="py-1.5 text-right">{inr(i.grand_total)}</td><td className="py-1.5 text-right">{inr(i.amount_paid)}</td>
                      <td className="py-1.5 text-right font-semibold text-red-700">{inr(i.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" disabled={picked.size === 0} onClick={() => clear(Array.from(picked))}>Clear selected ({picked.size})</button>
                <button type="button" className="btn-primary btn-sm" onClick={() => clear('all')}>Clear all</button>
              </div>
            </>
          )}
          {dues.uninvoicedOrders.length > 0 && (
            <p className="text-xs text-gray-500">
              Not yet invoiced (in progress — clear from the order once it&apos;s ready):{' '}
              {dues.uninvoicedOrders.map((o) => `${o.order_number} ${inr(o.balance)}`).join(', ')}
            </p>
          )}
          <p className="text-xs text-gray-400">Uses the same silent clear as Outstanding Dues: invoices are marked paid and linked tailoring orders updated. No WhatsApp is sent.</p>
        </div>
      )}
    </div>
  );
}

// ─── Audit log ────────────────────────────────────────────────────────────────

function AuditLog() {
  const [rows, setRows] = useState<Array<{ id: string; created_at: string; action: string; target: string | null; details: unknown; ip: string | null }>>([]);
  const [diag, setDiag] = useState<{ cancelledRetailWithoutReversal: { count: number; total: number } } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<{ rows: typeof rows }>('/api/shrx/audit').then((d) => setRows(d.rows)).catch((e) => setErr(e.message));
    api<NonNullable<typeof diag>>('/api/shrx/diagnostics').then(setDiag).catch(() => {});
  }, []);
  return (
    <div className="space-y-3">
      {diag && (
        <p className="rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-600">
          Retail invoices cancelled before cancellation started reversing the ledger: <strong>{diag.cancelledRetailWithoutReversal.count}</strong> ({inr(diag.cancelledRetailWithoutReversal.total)}). Left untouched.
        </p>
      )}
      <ErrorNote msg={err} />
      <div className="card overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">IP</th><th className="px-3 py-2">Details</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className={/failed|refused|error|blocked/.test(r.action) ? 'bg-red-50' : ''}>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{dt(r.created_at)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.target ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{r.ip}</td>
                <td className="max-w-md px-3 py-2"><pre className="whitespace-pre-wrap text-[10px] text-gray-500">{r.details ? JSON.stringify(r.details) : ''}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
