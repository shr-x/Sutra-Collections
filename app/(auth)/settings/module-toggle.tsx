'use client';

import { useState } from 'react';

interface Props {
  enabled: boolean;
  name: string;
  action: (formData: FormData) => Promise<void>;
}

export default function ModuleToggle({ enabled: initialEnabled, name, action }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (loading) return;
    setLoading(true);
    const next = !enabled;
    setEnabled(next);
    const fd = new FormData();
    if (next) fd.append(name, 'on');
    try {
      await action(fd);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={handleToggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
          enabled ? 'bg-purple-600' : 'bg-gray-200'
        } disabled:opacity-60`}
      >
        <span
          className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className={`text-sm font-medium ${enabled ? 'text-green-600' : 'text-gray-400'}`}>
        {enabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  );
}
