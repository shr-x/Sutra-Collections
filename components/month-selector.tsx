'use client';

import { useRouter } from 'next/navigation';

/**
 * Styled month/year navigator with ◀ ▶ arrows. Auto-navigates on change
 * (no separate "View" button). `month` is "YYYY-MM"; `basePath` is the page route.
 */
export default function MonthSelector({ month, basePath }: { month: string; basePath: string }) {
  const router = useRouter();
  const [y, m] = month.split('-').map(Number);

  const go = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    router.push(`${basePath}?month=${next}`);
  };

  const label = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous month"
        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
      >
        ◀
      </button>
      <span className="min-w-[140px] text-center text-sm font-semibold text-gray-800">{label}</span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next month"
        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
      >
        ▶
      </button>
    </div>
  );
}
