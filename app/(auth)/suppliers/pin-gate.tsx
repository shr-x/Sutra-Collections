'use client';

import { useEffect, useState } from 'react';

// Change this to the real PIN before deploying — hardcoded on purpose, not
// read from env or exposed anywhere in the UI. This is a lightweight
// workplace-privacy gate, not real access control (it runs client-side).
const SUPPLIERS_PIN = '6114';

const SESSION_KEY = 'suppliers-pin-unlocked';

export default function SuppliersPinGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setUnlocked(sessionStorage.getItem(SESSION_KEY) === '1');
    setChecked(true);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin === SUPPLIERS_PIN) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setUnlocked(true);
      setError('');
    } else {
      setError('Incorrect PIN.');
      setPin('');
    }
  }

  // Avoid a flash of the PIN screen while sessionStorage is being read.
  if (!checked) return null;

  if (unlocked) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form onSubmit={handleSubmit} className="card w-full max-w-xs text-center">
        <div className="mb-4 flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-2xl">🔒</span>
        </div>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Suppliers Locked</h2>
        <p className="mb-4 text-sm text-gray-500">Enter the 4-digit PIN to continue.</p>
        <input
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
        <button type="submit" disabled={pin.length !== 4} className="btn-primary mt-4 w-full disabled:opacity-50">
          Unlock
        </button>
      </form>
    </div>
  );
}
