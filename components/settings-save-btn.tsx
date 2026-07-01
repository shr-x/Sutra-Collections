'use client';

import { useFormStatus } from 'react-dom';

export default function SettingsSaveBtn({ label = 'Save' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60 transition-colors"
    >
      {pending ? 'Saving…' : label}
    </button>
  );
}
