'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createWalkInCustomerAction } from './actions';

export default function WalkInCustomerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const reset = () => {
    setName(''); setPhone(''); setError(''); setSaving(false); setDone(false);
  };
  const close = () => { setOpen(false); reset(); };

  const save = async () => {
    if (!name.trim() || !phone.trim()) { setError('Name and phone are both required.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await createWalkInCustomerAction(name.trim(), phone.trim());
      if (!res.success) { setError(res.error ?? 'Failed to save'); return; }
      setDone(true);
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        + Add Walk-in Customer
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="font-semibold text-gray-900">Add Walk-in Customer</h2>
              <button type="button" onClick={close} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              {done ? (
                <>
                  <p className="text-sm text-green-700">
                    ✓ Saved. A thank-you WhatsApp message has been sent.
                  </p>
                  <div className="flex justify-end">
                    <button type="button" onClick={close} className="btn-primary text-sm">Done</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">
                    For visitors who stopped by but didn&apos;t buy anything. They&apos;ll get a
                    one-time WhatsApp thank-you with a link to follow us on Instagram.
                  </p>
                  <div>
                    <label className="label text-xs">Name *</label>
                    <input
                      className="input text-sm" value={name} maxLength={255}
                      onChange={(e) => setName(e.target.value)} autoFocus
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Phone *</label>
                    <input
                      type="tel" className="input text-sm" value={phone} maxLength={20}
                      placeholder="9876543210"
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={close} className="btn-secondary text-sm">Cancel</button>
                    <button
                      type="button" onClick={save} disabled={saving || !name.trim() || !phone.trim()}
                      className="btn-primary text-sm"
                    >
                      {saving ? 'Saving…' : 'Save & Send Thank-you'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
