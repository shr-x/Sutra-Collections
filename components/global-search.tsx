'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchResult } from '@/app/api/search/route';

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  customer:  'Customer',
  invoice:   'Invoice',
  item:      'Item',
  tailoring: 'Order',
};

const TYPE_ICON: Record<SearchResult['type'], string> = {
  customer:  '👥',
  invoice:   '🧾',
  item:      '📦',
  tailoring: '✂️',
};

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ]           = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen]     = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (query: string) => {
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json() as { results: SearchResult[] };
      setResults(data.results ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(() => search(q), 280);
    return () => clearTimeout(timer.current);
  }, [q, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    setQ('');
    setResults([]);
    router.push(href);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && active >= 0 && results[active]) {
      e.preventDefault();
      navigate(results[active].href);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative w-72 max-w-full">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
          🔍
        </span>
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(-1); }}
          onFocus={() => { if (q.length >= 2) setOpen(true); }}
          onKeyDown={handleKey}
          placeholder="Search customers, invoices, items…"
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 rounded-lg border border-transparent
                     focus:border-purple-400 focus:bg-white focus:outline-none transition-all"
        />
        {loading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden max-h-80 overflow-y-auto">
          {results.length === 0 && !loading ? (
            <p className="px-4 py-3 text-sm text-gray-400 text-center">No results for "{q}"</p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                onMouseDown={() => navigate(r.href)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                  i === active ? 'bg-purple-50' : ''
                } ${i > 0 ? 'border-t border-gray-100' : ''}`}
              >
                <span className="text-base mt-0.5 shrink-0">{TYPE_ICON[r.type]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-800 truncate">{r.label}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      {TYPE_LABEL[r.type]}
                    </span>
                  </div>
                  {r.sub && <p className="text-xs text-gray-400 truncate mt-0.5">{r.sub}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
