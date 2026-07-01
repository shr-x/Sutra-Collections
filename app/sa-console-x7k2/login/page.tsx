'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saLoginAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export default function SALoginPage() {
  const [state, formAction] = useFormState(saLoginAction, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-800 p-8 shadow-xl">
        <h1 className="mb-1 text-xl font-semibold text-white">System Console</h1>
        <p className="mb-6 text-xs text-gray-500">Sutra Collections — Restricted Access</p>

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm text-gray-400">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-gray-400">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {state?.error && (
            <p className="rounded border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-300">
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
