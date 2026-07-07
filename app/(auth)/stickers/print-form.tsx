'use client';

import { useState } from 'react';

export function PrintForm({ purchaseId }: { purchaseId: string }) {
  const [size, setSize] = useState('s25');
  const [customW, setCustomW] = useState('30');
  const [customH, setCustomH] = useState('45');
  const isCustom = size === 'custom';

  return (
    <form
      action="/api/stickers/pdf"
      method="GET"
      target="_blank"
      className="flex items-center gap-1.5 flex-wrap"
    >
      <input type="hidden" name="purchaseId" value={purchaseId} />

      <select
        name="size"
        value={size}
        onChange={(e) => setSize(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs shadow-sm focus:border-purple-500 focus:outline-none"
      >
        <option value="s20">20×20mm — Price Tag (S)</option>
        <option value="s25">25×25mm — Price Tag (L)</option>
        <option value="h40">40×60mm — Hang Tag (S)</option>
        <option value="h50">50×75mm — Hang Tag (L)</option>
        <option value="custom">Custom Size…</option>
      </select>

      {isCustom && (
        <>
          <input
            type="number"
            name="wMM"
            value={customW}
            onChange={(e) => setCustomW(e.target.value)}
            min={5}
            max={200}
            required
            placeholder="W"
            className="w-14 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-purple-500 focus:outline-none"
          />
          <span className="text-xs text-gray-400">×</span>
          <input
            type="number"
            name="hMM"
            value={customH}
            onChange={(e) => setCustomH(e.target.value)}
            min={5}
            max={200}
            required
            placeholder="H"
            className="w-14 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-purple-500 focus:outline-none"
          />
          <span className="text-xs text-gray-400">mm</span>
        </>
      )}

      <button type="submit" className="btn-primary btn-sm">
        Print
      </button>
    </form>
  );
}
