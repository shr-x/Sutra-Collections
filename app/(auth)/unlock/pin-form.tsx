'use client';

import { useState } from 'react';

export default function PinForm({ next, sectionName }: { next: string; sectionName: string }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/section-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not unlock.');
        setPin('');
        return;
      }
      // Full navigation so the server re-renders the section with the new cookie.
      window.location.assign(data.next);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-xs text-center">
      <div className="mb-4 flex justify-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-2xl">🔒</span>
      </div>
      <h2 className="mb-1 text-base font-semibold text-gray-900">{sectionName} Locked</h2>
      <p className="mb-4 text-sm text-gray-500">Enter the 4-digit PIN to continue.</p>
      <input
        name="pin"
        type="password"
        inputMode="numeric"
        maxLength={4}
        autoFocus
        value={pin}
        onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
        className="input w-full text-center text-2xl tracking-[0.5em]"
        placeholder="••••"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pin.length !== 4 || pending} className="btn-primary mt-4 w-full disabled:opacity-50">
        {pending ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  );
}
