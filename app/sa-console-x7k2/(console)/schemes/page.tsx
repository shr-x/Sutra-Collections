import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { toggleSASchemeAction, deleteSASchemeAction } from './actions';

interface SchemeRow {
  id: string;
  name: string;
  scheme_type: string;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

export default async function SchemesPage() {
  await requireSA();

  const { rows } = await query<SchemeRow>(`
    SELECT id, name, scheme_type, is_active,
           valid_from::text, valid_until::text, created_at
    FROM discount_schemes
    ORDER BY created_at DESC
  `);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Discount Schemes</h1>
        <Link
          href="/sa-console-x7k2/schemes/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Scheme
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-700/50">
            <tr>
              {['Name', 'Type', 'Active', 'Valid From', 'Valid Until', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                <td className="px-4 py-3 text-sm font-medium text-white">{s.name}</td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
                    {s.scheme_type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      s.is_active
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-gray-700 text-gray-500'
                    }`}
                  >
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  {s.valid_from ? new Date(s.valid_from).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  {s.valid_until ? new Date(s.valid_until).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/sa-console-x7k2/schemes/${s.id}/edit`}
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      Edit
                    </Link>
                    <form action={toggleSASchemeAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className={`text-xs ${
                          s.is_active
                            ? 'text-red-400 hover:text-red-300'
                            : 'text-green-400 hover:text-green-300'
                        }`}
                      >
                        {s.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </form>
                    <form
                      action={deleteSASchemeAction}
                    >
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="text-xs text-red-400 hover:text-red-300">
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                  No discount schemes found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
