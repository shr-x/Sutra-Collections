import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import SearchInput from '@/components/search-input';

export const metadata: Metadata = { title: 'Design Catalog' };

export default async function DesignsPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string };
}) {
  await requireRole('admin');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (searchParams.q) {
    params.push(`%${searchParams.q.trim()}%`);
    conditions.push(`(d.name ILIKE $${params.length} OR d.description ILIKE $${params.length})`);
  }
  if (searchParams.category) {
    params.push(searchParams.category);
    conditions.push(`d.category = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [designsRes, catsRes] = await Promise.all([
    query(
      `SELECT d.id, d.name, d.category, d.photo_path, d.description, d.created_at,
              COUNT(f.id) AS field_count
       FROM designs d
       LEFT JOIN design_measurement_fields f ON f.design_id = d.id
       ${where}
       GROUP BY d.id
       ORDER BY d.name`,
      params
    ),
    query(`SELECT DISTINCT category FROM designs WHERE category IS NOT NULL ORDER BY category`),
  ]);

  const designs    = designsRes.rows;
  const categories = catsRes.rows.map((r) => r.category as string);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Design Catalog</h1>
        <Link href="/designs/new" className="btn-primary">+ New Design</Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search designs…" />
        <div className="flex flex-wrap gap-1.5 text-sm">
          <Link
            href="/designs"
            className={`rounded-full px-3 py-1 text-xs font-medium ${!searchParams.category ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              href={`/designs?category=${encodeURIComponent(cat)}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${searchParams.category === cat ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {cat}
            </Link>
          ))}
        </div>
      </div>

      {designs.length === 0 ? (
        <div className="card py-16 text-center text-gray-400">
          <p className="text-4xl mb-3">✂️</p>
          <p className="text-sm">No designs yet.</p>
          <Link href="/designs/new" className="mt-3 inline-block text-sm text-purple-600 hover:underline">
            Create your first design →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {designs.map((d) => (
            <Link
              key={d.id}
              href={`/designs/${d.id}`}
              className="card group flex flex-col gap-2 p-3 hover:ring-2 hover:ring-purple-500 transition-all"
            >
              {/* Thumbnail */}
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
                {d.photo_path ? (
                  <img
                    src={`/${d.photo_path}`}
                    alt={d.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50 p-3 text-center">
                    <span className="line-clamp-3 text-xl font-semibold leading-tight text-gray-400">{d.name}</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 group-hover:text-purple-700 truncate">
                  {d.name}
                </p>
                {d.category && (
                  <p className="text-xs text-gray-400">{d.category}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {d.field_count} field{Number(d.field_count) !== 1 ? 's' : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
