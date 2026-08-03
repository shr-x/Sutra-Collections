import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { PrintForm } from './print-form';

export const metadata: Metadata = { title: 'Stickers' };

interface PurchaseRow {
  id: string;
  purchase_number: string;
  purchase_date: string;
  supplier_name: string;
  sticker_count: number;
}

interface SearchResult {
  code: string;
  item_name: string;
  price: string;
  purchase_number: string;
  purchase_date: string;
  size_name: string | null;
  color_name: string | null;
}

export default async function StickersPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  await requireRole('admin', 'staff');

  const searchCode = (searchParams.code ?? '').trim().toUpperCase();

  const [purchasesRes, searchRes] = await Promise.all([
    query<PurchaseRow>(
      `SELECT pi.id, pi.purchase_number, pi.purchase_date::text, s.name AS supplier_name,
              COUNT(sc.id)::int AS sticker_count
       FROM purchase_invoices pi
       JOIN suppliers s ON s.id = pi.supplier_id
       INNER JOIN sticker_codes sc ON sc.purchase_invoice_id = pi.id
       GROUP BY pi.id, pi.purchase_number, pi.purchase_date, s.name
       ORDER BY pi.purchase_date DESC, pi.created_at DESC
       LIMIT 60`,
    ),
    // Price is read LIVE from items.sale_price (not the sticker_codes.price
    // snapshot) so this matches what would actually print if reprinted now.
    searchCode
      ? query<SearchResult>(
          `SELECT sc.code, it.name AS item_name, COALESCE(it.sale_price, 0)::text AS price,
                  pi.purchase_number, pi.purchase_date::text,
                  isz.size_name, ic.color_name
           FROM sticker_codes sc
           JOIN items it             ON it.id  = sc.item_id
           JOIN purchase_invoices pi ON pi.id  = sc.purchase_invoice_id
           LEFT JOIN item_sizes  isz ON isz.id = sc.size_id
           LEFT JOIN item_colors ic  ON ic.id  = sc.color_id
           WHERE UPPER(sc.code) = $1`,
          [searchCode],
        )
      : Promise.resolve({ rows: [] as SearchResult[] }),
  ]);

  const purchases = purchasesRes.rows;
  const searchResult = searchRes.rows[0] ?? null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stickers</h1>
          <p className="text-sm text-gray-500">Per-unit labels generated from purchase invoices</p>
        </div>
      </div>

      {/* Code search */}
      <div className="card mb-6">
        <p className="mb-3 text-sm font-semibold text-gray-700">Look up a sticker code</p>
        <form method="GET" className="flex gap-2">
          <input
            name="code"
            defaultValue={searchCode}
            placeholder="e.g. SC-0042"
            autoComplete="off"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 uppercase"
          />
          <button type="submit" className="btn-primary btn-sm">Search</button>
          {searchCode && (
            <a href="/stickers" className="btn-secondary btn-sm">Clear</a>
          )}
        </form>

        {searchCode && (
          <div className="mt-4">
            {searchResult ? (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-purple-500 uppercase tracking-wide mb-1">Code</p>
                    <p className="text-xl font-bold font-mono text-purple-900">{searchResult.code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Price</p>
                    <p className="text-xl font-bold text-gray-900">
                      ₹{Number(searchResult.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Item</p>
                    <p className="font-medium text-gray-900">{searchResult.item_name}</p>
                  </div>
                  {(searchResult.size_name || searchResult.color_name) && (
                    <div>
                      <p className="text-xs text-gray-500">Variant</p>
                      <p className="font-medium text-gray-900">
                        {[searchResult.size_name, searchResult.color_name].filter(Boolean).join(' / ')}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">Purchase</p>
                    <p className="font-mono text-xs text-purple-700">{searchResult.purchase_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Date</p>
                    <p className="text-gray-700">
                      {new Date(searchResult.purchase_date).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
                <p className="text-sm text-gray-500">No sticker found for code <span className="font-mono font-semibold">{searchCode}</span></p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Purchase list */}
      <div className="card p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Purchases with stickers</p>
          <p className="text-xs text-gray-400">{purchases.length} invoice{purchases.length !== 1 ? 's' : ''}</p>
        </div>

        {purchases.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            No stickers generated yet. Stickers are created automatically when a purchase invoice is saved.
          </p>
        ) : (
          <>
            {/* Mobile */}
            <div className="sm:hidden divide-y divide-gray-100">
              {purchases.map((p) => (
                <div key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-mono text-xs font-semibold text-purple-700">{p.purchase_number}</p>
                      <p className="text-sm text-gray-600 mt-0.5">{p.supplier_name}</p>
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                        {p.sticker_count} label{p.sticker_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    {new Date(p.purchase_date).toLocaleDateString('en-IN')}
                  </p>
                  <PrintForm purchaseId={p.id} />
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Purchase #</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Labels</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Print</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-purple-700">{p.purchase_number}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(p.purchase_date).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{p.supplier_name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                          {p.sticker_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PrintForm purchaseId={p.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

