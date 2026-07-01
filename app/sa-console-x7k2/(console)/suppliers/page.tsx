import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { deleteSASupplierAction } from './actions';

interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  created_at: string;
}

export default async function SASuppliersPage() {
  await requireSA();

  const res = await query<SupplierRow>(
    `SELECT id, name, phone, email, gstin, created_at
     FROM suppliers
     ORDER BY created_at DESC`
  );
  const suppliers = res.rows;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Suppliers</h1>
        <Link
          href="/sa-console-x7k2/suppliers/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Supplier
        </Link>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-700/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">GSTIN</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No suppliers found.
                </td>
              </tr>
            )}
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                <td className="px-4 py-3 text-gray-300 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-gray-300">{s.phone ?? '—'}</td>
                <td className="px-4 py-3 text-gray-300">{s.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-300">{s.gstin ?? '—'}</td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(s.created_at).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/sa-console-x7k2/suppliers/${s.id}/edit`}
                      className="text-sm text-indigo-400 hover:text-indigo-300"
                    >
                      Edit
                    </Link>
                    <form
                      action={deleteSASupplierAction}
                    >
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="rounded bg-red-900 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-800"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
