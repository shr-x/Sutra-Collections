'use client';

import { useState, useRef, useEffect } from 'react';

export interface DatePickerProps {
  name?: string;
  value?: string;          // YYYY-MM-DD (controlled)
  defaultValue?: string;   // YYYY-MM-DD (uncontrolled)
  onChange?: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;      // applied to the trigger button
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_HEADERS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function parseIsoYear(iso: string) { return parseInt(iso.slice(0, 4)); }
function parseIsoMonth(iso: string) { return parseInt(iso.slice(5, 7)) - 1; }

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Guards against a malformed value/defaultValue (e.g. not a real "YYYY-MM-DD")
// silently producing a NaN-driven, un-clickable empty calendar grid.
function safeIso(iso: string): string {
  return ISO_DATE_RE.test(iso) ? iso : '';
}

export default function DatePicker({
  name,
  value,
  defaultValue,
  onChange,
  required,
  placeholder = 'Select date',
  className,
}: DatePickerProps) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(safeIso(defaultValue ?? ''));
  const current = safeIso(controlled ? (value ?? '') : internal);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'cal' | 'my'>('cal');
  const seed = current || todayIso();
  const [viewYear, setViewYear] = useState(() => parseIsoYear(seed));
  const [viewMonth, setViewMonth] = useState(() => parseIsoMonth(seed));

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openPicker() {
    const v = current || todayIso();
    setViewYear(parseIsoYear(v));
    setViewMonth(parseIsoMonth(v));
    setView('cal');
    setOpen(true);
  }

  function select(iso: string) {
    if (!controlled) setInternal(iso);
    onChange?.(iso);
    setOpen(false);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  // Build calendar grid for current view (Mon-first)
  const cells: { iso: string; day: number; outside: boolean }[] = [];
  const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;     // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = viewMonth === 0 ? 12 : viewMonth;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ iso: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      iso: `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
      day: d,
      outside: false,
    });
  }
  const tail = cells.length % 7;
  if (tail > 0) {
    for (let d = 1; d <= 7 - tail; d++) {
      const m = viewMonth === 11 ? 1 : viewMonth + 2;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({ iso: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d, outside: true });
    }
  }

  const today = todayIso();

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={current} required={required} />}

      <button
        type="button"
        onClick={openPicker}
        className={
          className
            ? `${className} flex w-full items-center justify-between gap-2 text-left`
            : 'flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-left'
        }
      >
        <span className={current ? 'text-gray-900' : 'text-gray-400'}>
          {current ? fmtDisplay(current) : placeholder}
        </span>
        <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          {view === 'cal' ? (
            <>
              {/* Month navigation */}
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 text-gray-500 text-lg leading-none"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setView('my')}
                  className="text-sm font-semibold text-gray-900 hover:text-purple-700 transition-colors"
                >
                  {MONTHS[viewMonth]} {viewYear}
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 text-gray-500 text-lg leading-none"
                >
                  ›
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className="mb-1 grid grid-cols-7">
                {DAY_HEADERS.map((d) => (
                  <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {d}
                  </div>
                ))}
              </div>

              {/* Date cells */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map(({ iso, day, outside }) => {
                  const isToday = iso === today;
                  const isSel = iso === current;
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => select(iso)}
                      className={[
                        'mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors',
                        outside
                          ? 'text-gray-300 hover:bg-gray-50'
                          : 'text-gray-700 hover:bg-purple-50 hover:text-purple-700',
                        isSel ? '!bg-purple-600 !text-white hover:!bg-purple-700' : '',
                        isToday && !isSel ? 'ring-2 ring-purple-400 ring-offset-1' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* Month-Year grid */
            <div>
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 text-gray-500 text-lg leading-none"
                >
                  ‹
                </button>
                <span className="text-sm font-semibold text-gray-900">{viewYear}</span>
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 text-gray-500 text-lg leading-none"
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setViewMonth(i); setView('cal'); }}
                    className={`rounded-lg py-2 text-xs font-medium transition-colors ${
                      i === viewMonth
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-700 hover:bg-purple-50 hover:text-purple-700'
                    }`}
                  >
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
