'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

export interface ImportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
  required?: boolean;
}

export interface SaveResult {
  saved: number;
  skipped: number;
  errors: string[];
  skippedDetails?: string[];
}

interface Props {
  module: string;
  columns: ImportColumn[];
  title: string;
  backHref: string;
  onSave: (rows: Record<string, string>[]) => Promise<SaveResult>;
  acceptTypes?: string;
}

type Step = 'upload' | 'processing' | 'preview' | 'saving' | 'done' | 'error';

export default function ImportWizard({
  module, columns, title, backHref, onSave,
  acceptTypes = '.xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png',
}: Props) {
  const [step, setStep]         = useState<Step>('upload');
  const [rows, setRows]         = useState<Record<string, string>[]>([]);
  const [editing, setEditing]   = useState<{ ri: number; key: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult]     = useState<SaveResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setStep('processing');
    setErrorMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch(`/api/import/${module}`, { method: 'POST', body: form });
      const json = await res.json() as { rows?: Record<string, string>[]; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `Server error ${res.status}`);
      setRows(json.rows ?? []);
      setStep('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setStep('error');
    }
  }, [module]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const updateCell = (ri: number, key: string, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[ri] = { ...next[ri], [key]: value };
      return next;
    });
  };

  const deleteRow = (ri: number) => setRows((prev) => prev.filter((_, i) => i !== ri));

  const addRow = () => {
    const blank = Object.fromEntries(columns.map((c) => [c.key, c.options?.[0] ?? '']));
    setRows((prev) => [...prev, blank]);
  };

  const handleConfirm = async () => {
    setStep('saving');
    try {
      const res = await onSave(rows);
      setResult(res);
      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
      setStep('error');
    }
  };

  const reset = () => { setStep('upload'); setRows([]); setResult(null); setErrorMsg(''); };

  // ── Upload ──────────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-14 text-center transition-colors ${
            dragging ? 'border-purple-500 bg-purple-50' : 'border-gray-300 bg-gray-50 hover:border-purple-400'
          }`}
        >
          <div className="text-5xl mb-4">📂</div>
          <p className="text-lg font-medium text-gray-700 mb-1">Drag &amp; drop your file here</p>
          <p className="text-sm text-gray-400 mb-6">Excel (.xlsx), CSV, PDF, or image (JPG / PNG)</p>
          <label className="btn-primary cursor-pointer">
            Browse File
            <input type="file" accept={acceptTypes} className="hidden" onChange={handleInput} />
          </label>
        </div>
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-700">
            <strong>Gemini AI</strong> will extract the data automatically. You can review and edit every cell before saving.
          </p>
        </div>
      </div>
    );
  }

  // ── Processing ──────────────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <div className="text-5xl mb-5 animate-bounce">✨</div>
        <p className="text-lg font-semibold text-gray-700">Gemini is extracting data…</p>
        <p className="mt-1 text-sm text-gray-400">This usually takes 5–20 seconds</p>
        <div className="mt-6 h-1.5 w-52 mx-auto overflow-hidden rounded-full bg-gray-200">
          <div className="h-full animate-pulse bg-purple-500 rounded-full" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="max-w-xl mx-auto">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="font-semibold text-red-700 mb-2">Something went wrong</p>
          <p className="text-sm text-red-600 font-mono break-all">{errorMsg}</p>
          <button onClick={reset} className="btn-secondary mt-6">Try Again</button>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-800 mb-6">Import Complete</h2>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Saved',    value: result.saved,          color: 'text-green-700' },
            { label: 'Skipped',  value: result.skipped,        color: 'text-amber-600' },
            { label: 'Errors',   value: result.errors.length,  color: 'text-red-600'   },
          ].map((c) => (
            <div key={c.label} className="card text-center py-4">
              <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
        {result.errors.length > 0 && (
          <div className="text-left rounded-lg border border-red-200 bg-red-50 p-3 mb-6">
            <p className="text-xs font-semibold text-red-700 mb-1">Errors:</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
              {result.errors.length > 10 && <li className="text-gray-400">…and {result.errors.length - 10} more</li>}
            </ul>
          </div>
        )}
        {result.skippedDetails && result.skippedDetails.length > 0 && (
          <details className="text-left mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-amber-700">
              Skipped details ({result.skippedDetails.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {result.skippedDetails.map((s, i) => (
                <li key={i} className="rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-xs text-amber-800">
                  ⚠️ {s}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex justify-center gap-3">
          <button onClick={reset} className="btn-secondary">Import More</button>
          <Link href={backHref} className="btn-primary">Done →</Link>
        </div>
      </div>
    );
  }

  // ── Preview / Saving ─────────────────────────────────────────────────────────
  const isSaving = step === 'saving';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{rows.length}</span> row{rows.length !== 1 ? 's' : ''} extracted
          — click any cell to edit
        </p>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-secondary text-sm" disabled={isSaving}>← Re-upload</button>
          <button onClick={addRow} className="btn-secondary text-sm" disabled={isSaving}>+ Add Row</button>
          <button
            onClick={handleConfirm}
            disabled={isSaving || rows.length === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : `Save ${rows.length} Record${rows.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b">
            <tr>
              <th className="px-3 py-3 text-left w-8 text-gray-300">#</th>
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-3 text-left whitespace-nowrap">
                  {col.label}{col.required && <span className="text-red-400 ml-0.5">*</span>}
                </th>
              ))}
              <th className="px-2 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50 group">
                <td className="px-3 py-1.5 text-xs text-gray-300">{ri + 1}</td>
                {columns.map((col) => {
                  const val = row[col.key] ?? '';
                  const isEdit = editing?.ri === ri && editing?.key === col.key;

                  return (
                    <td key={col.key} className="px-1 py-1">
                      {col.type === 'select' ? (
                        <select
                          value={val}
                          disabled={isSaving}
                          onChange={(e) => updateCell(ri, col.key, e.target.value)}
                          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-purple-400 focus:outline-none disabled:opacity-50"
                        >
                          {col.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : isEdit ? (
                        <input
                          autoFocus
                          type={col.type === 'number' ? 'number' : 'text'}
                          value={val}
                          onChange={(e) => updateCell(ri, col.key, e.target.value)}
                          onBlur={() => setEditing(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Tab') setEditing(null);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          className="w-full rounded border border-purple-400 bg-white px-2 py-1 text-xs focus:outline-none min-w-[80px]"
                        />
                      ) : (
                        <div
                          onClick={() => !isSaving && setEditing({ ri, key: col.key })}
                          className={`cursor-text rounded px-2 py-1 text-xs min-h-[26px] min-w-[60px] hover:ring-1 hover:ring-purple-300 hover:bg-purple-50 transition-colors ${
                            !val && col.required ? 'text-red-400 italic' : 'text-gray-700'
                          }`}
                        >
                          {val || (col.required ? 'Required' : <span className="text-gray-300">—</span>)}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center">
                  <button
                    onClick={() => deleteRow(ri)}
                    disabled={isSaving}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-xs disabled:opacity-0"
                    title="Delete row"
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-gray-400">
            No rows extracted. <button onClick={reset} className="text-purple-600 hover:underline">Re-upload</button> or add rows manually.
          </p>
        )}
      </div>
    </div>
  );
}
