'use client';

import { useState } from 'react';

export default function ShrxLogin({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true); setError('');
    try {
      const res = await fetch('/api/shrx/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Login failed'); setPassword(''); return; }
      window.location.reload();
    } catch {
      setError('Network error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold text-gray-900">SHRX Access</h1>
        <p className="mb-4 text-sm text-gray-500">Owner console. Every action is logged.</p>
        {!configured && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The SHRX password hasn&apos;t been set up yet.
          </p>
        )}
        <input
          type="password" autoFocus autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} className="input w-full" placeholder="Password"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={!password || pending} className="btn-primary mt-4 w-full disabled:opacity-50">
          {pending ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
