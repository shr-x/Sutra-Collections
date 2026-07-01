'use client';

import { useState, useEffect, useRef } from 'react';

interface FabricOption { id: string; name: string }

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function FabricCombobox({ value, onChange }: Props) {
  const [options, setOptions] = useState<FabricOption[]>([]);
  const [open, setOpen]       = useState(false);
  const [typed, setTyped]     = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  // Keep typed in sync when value changes externally
  useEffect(() => { setTyped(value); }, [value]);

  useEffect(() => {
    fetch('/api/tailoring/fabric-options')
      .then((r) => r.json() as Promise<{ options?: FabricOption[] }>)
      .then((d) => setOptions(d.options ?? []))
      .catch(() => {});
  }, []);

  // Close when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const trimmed  = typed.trim();
  const filtered = options.filter((o) => o.name.toLowerCase().includes(typed.toLowerCase()));
  const canAdd   = trimmed.length > 0 &&
    !options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase());

  function select(name: string) {
    onChange(name);
    setTyped(name);
    setOpen(false);
  }

  function addOption() {
    if (!trimmed) return;
    select(trimmed);
    setOpen(false);
    // Persist to DB in background
    fetch('/api/tailoring/fabric-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
      .then((r) => r.json() as Promise<{ option?: FabricOption }>)
      .then((d) => {
        if (d.option) {
          setOptions((prev) => {
            const without = prev.filter((o) => o.id !== d.option!.id);
            return [...without, d.option!].sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      })
      .catch(() => {});
  }

  function deleteOption(opt: FabricOption, e: React.MouseEvent) {
    e.stopPropagation();
    setOptions((prev) => prev.filter((o) => o.id !== opt.id));
    fetch('/api/tailoring/fabric-options', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: opt.id }),
    }).catch(() => {});
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={typed}
        onChange={(e) => { setTyped(e.target.value); onChange(e.target.value); }}
        onFocus={() => setOpen(true)}
        className="input w-full"
        placeholder="e.g. Navy Blue Cotton, Raw Silk…"
        autoComplete="off"
      />

      {open && (filtered.length > 0 || canAdd) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="max-h-52 overflow-y-auto">
            {filtered.map((opt) => (
              <div
                key={opt.id}
                className="flex cursor-pointer items-center justify-between px-3 py-2.5 hover:bg-purple-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(opt.name)}
              >
                <span className="text-sm text-gray-800">{opt.name}</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => deleteOption(opt, e)}
                  className="ml-2 text-xs text-gray-300 hover:text-red-500"
                  title="Remove option"
                >
                  ×
                </button>
              </div>
            ))}
            {canAdd && (
              <div
                className="cursor-pointer border-t border-gray-100 px-3 py-2.5 hover:bg-green-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={addOption}
              >
                <span className="text-sm text-green-700">+ Add &ldquo;{trimmed}&rdquo;</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
