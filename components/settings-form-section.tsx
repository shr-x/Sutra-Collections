'use client';

import { useFormState } from 'react-dom';
import { useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { SettingsSaveResult } from '@/app/(auth)/settings/actions';

interface Props {
  action: (prev: SettingsSaveResult, formData: FormData) => Promise<SettingsSaveResult>;
  children: React.ReactNode;
  className?: string;
  label?: string;
}

function SaveBtn({ label }: { label: string }) {
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

export default function SettingsFormSection({ action, children, className, label = 'Save' }: Props) {
  const [state, formAction] = useFormState<SettingsSaveResult, FormData>(action, { success: false });
  const toastRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!state.success && !state.error) return;
    const el = toastRef.current;
    if (!el) return;
    el.style.opacity = '1';
    const t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex items-center justify-end gap-3 mt-4">
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
        <span
          ref={toastRef}
          aria-live="polite"
          style={{ opacity: 0, transition: 'opacity 0.3s' }}
          className="text-xs text-green-600"
        >
          Saved
        </span>
        <SaveBtn label={label} />
      </div>
    </form>
  );
}
