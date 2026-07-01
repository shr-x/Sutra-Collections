'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { changePasswordAction, type ChangePasswordState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Change Password'}
    </button>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useFormState<ChangePasswordState | null, FormData>(changePasswordAction, null);

  if (state?.success) {
    return (
      <div className="rounded border border-green-700 bg-green-900/40 px-4 py-3 text-sm text-green-300">
        Password changed successfully.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="rounded border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-300">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="current_password">
          Current Password
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="new_password">
          New Password
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="confirm_password">
          Confirm New Password
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
