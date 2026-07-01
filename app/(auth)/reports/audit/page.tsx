import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Audit Log' };

const ACTION_BADGE: Record<string, string> = {
  create:       'bg-green-100 text-green-700',
  update:       'bg-blue-100 text-blue-700',
  delete:       'bg-red-100 text-red-700',
  stage_change: 'bg-yellow-100 text-yellow-700',
  payment:      'bg-purple-100 text-purple-700',
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; user_id?: string; action?: string; entity?: string; page?: string };
}) {
  await requireRole('admin');

  const today  = new Date().toISOString().slice(0, 10);
  const from   = searchParams.from ?? today;
  const to     = searchParams.to   ?? today;
  const pageN  = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const limit  = 50;
  const offset = (pageN - 1) * limit;

  const conditions = [`al.created_at::date BETWEEN $1 AND $2`];
  const params: unknown[] = [from, to];

  if (searchParams.user_id) {
    params.push(searchParams.user_id);
    conditions.push(`al.user_id=$${params.length}`);
  }
  if (searchParams.action) {
    params.push(searchParams.action);
    conditions.push(`al.action=$${params.length}`);
  }
  if (searchParams.entity) {
    params.push(searchParams.entity);
    conditions.push(`al.entity_type=$${params.length}`);
  }

  const where = conditions.join(' AND ');

  let dbError: string | null = null;
  const rawData = await Promise.all([
    query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.entity_label,
              al.old_value, al.new_value, al.created_at,
              u.name AS user_name, u.role AS user_role
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}
       ORDER BY al.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM audit_log al WHERE ${where}`,
      params
    ),
    query(`SELECT id, name FROM users ORDER BY name`),
  ]).catch((err) => {
    dbError = err instanceof Error ? err.message : 'Database error';
    return null;
  });

  if (!rawData) {
    return (
      <div>
        <div className="page-header">
          <div>
            <nav className="text-sm text-gray-400 mb-1">
              <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Audit Log
            </nav>
            <h1 className="page-title">Audit Log</h1>
            <p className="text-xs text-amber-600 mt-1">Admin only</p>
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Database Error</p>
          <p className="mt-1 font-mono text-xs text-red-600">{dbError}</p>
          <p className="mt-2 text-xs text-gray-500">Run the Phase 8 migration SQL — the audit_log table must be created first.</p>
        </div>
      </div>
    );
  }

  const [logsRes, countRes, usersRes] = rawData;
  const total     = countRes.rows[0].total as number;
  const totalPages = Math.ceil(total / limit);

  const ENTITY_TYPES = [
    'invoice','quotation','credit_note','debit_note','purchase',
    'customer','supplier','item','expense','tailoring_order','design','user','setting',
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Audit Log
          </nav>
          <h1 className="page-title">Audit Log</h1>
          <p className="text-xs text-amber-600 mt-1">Admin only</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/reports/export/audit-log?format=json&from=${from}&to=${to}${searchParams.user_id ? '&user_id=' + searchParams.user_id : ''}${searchParams.action ? '&action=' + searchParams.action : ''}${searchParams.entity ? '&entity=' + searchParams.entity : ''}`}
            className="btn-secondary text-sm"
            download
          >
            Export JSON
          </a>
          <a
            href={`/api/reports/audit/pdf?from=${from}&to=${to}${searchParams.user_id ? '&user_id=' + searchParams.user_id : ''}${searchParams.action ? '&action=' + searchParams.action : ''}${searchParams.entity ? '&entity=' + searchParams.entity : ''}`}
            className="btn-secondary text-sm"
            download
          >
            Export PDF
          </a>
        </div>
      </div>

      {/* Filters */}
      <form method="get" className="card mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <DatePicker name="from" defaultValue={from} className="input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <DatePicker name="to" defaultValue={to} className="input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">User</label>
            <select name="user_id" className="input text-sm">
              <option value="">All Users</option>
              {(usersRes.rows as Array<{ id: string; name: string }>).map((u) => (
                <option key={u.id} value={u.id} selected={searchParams.user_id === u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Action</label>
            <select name="action" className="input text-sm">
              <option value="">All Actions</option>
              {['create','update','delete','stage_change','payment'].map((a) => (
                <option key={a} value={a} selected={searchParams.action === a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity</label>
            <select name="entity" className="input text-sm">
              <option value="">All Entities</option>
              {ENTITY_TYPES.map((e) => (
                <option key={e} value={e} selected={searchParams.entity === e}>{e.replace('_',' ')}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary text-sm">Apply</button>
        </div>
      </form>

      <div className="text-xs text-gray-500 mb-3">{total} record{total !== 1 ? 's' : ''}</div>

      <div className="card p-0 overflow-hidden">
        {logsRes.rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-400">No audit records found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b">
              <tr>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Entity</th>
                <th className="px-4 py-3 text-left">Label</th>
                <th className="px-4 py-3 text-left">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(logsRes.rows as Array<{
                id: string; action: string; entity_type: string; entity_id: string;
                entity_label: string | null; old_value: string | null; new_value: string | null;
                created_at: string; user_name: string | null; user_role: string | null;
              }>).map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-xs">{row.user_name ?? '—'}</div>
                    <div className="text-xs text-gray-400 capitalize">{row.user_role}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[row.action] ?? 'bg-gray-100 text-gray-600'}`}>
                      {row.action.replace('_',' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 capitalize">{row.entity_type.replace('_',' ')}</td>
                  <td className="px-4 py-3 text-xs font-medium text-gray-700">{row.entity_label ?? '—'}</td>
                  <td className="px-4 py-3 max-w-xs">
                    {(row.old_value || row.new_value) && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-purple-600 hover:underline">View</summary>
                        <div className="mt-1 space-y-1">
                          {row.old_value && (
                            <div className="text-red-600 bg-red-50 rounded px-2 py-1 break-all">
                              Before: {row.old_value}
                            </div>
                          )}
                          {row.new_value && (
                            <div className="text-green-700 bg-green-50 rounded px-2 py-1 break-all">
                              After: {row.new_value}
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-gray-500">Page {pageN} of {totalPages}</span>
          <div className="flex gap-2">
            {pageN > 1 && (
              <Link
                href={`/reports/audit?from=${from}&to=${to}&page=${pageN - 1}${searchParams.user_id ? '&user_id=' + searchParams.user_id : ''}${searchParams.action ? '&action=' + searchParams.action : ''}${searchParams.entity ? '&entity=' + searchParams.entity : ''}`}
                className="btn-secondary text-xs"
              >
                ← Previous
              </Link>
            )}
            {pageN < totalPages && (
              <Link
                href={`/reports/audit?from=${from}&to=${to}&page=${pageN + 1}${searchParams.user_id ? '&user_id=' + searchParams.user_id : ''}${searchParams.action ? '&action=' + searchParams.action : ''}${searchParams.entity ? '&entity=' + searchParams.entity : ''}`}
                className="btn-secondary text-xs"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
