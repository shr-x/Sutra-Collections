import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createTailorAction } from '../actions';

export const metadata: Metadata = { title: 'New Tailor' };

export default async function NewTailorPage() {
  await requireRole('admin');

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/tailoring/tailors" className="text-sm text-purple-600 hover:underline">
            ← Tailors
          </Link>
          <h1 className="page-title mt-1">New Tailor</h1>
        </div>
      </div>

      <form action={createTailorAction} className="card max-w-lg space-y-4">
        <div>
          <label className="label mb-1">Name *</label>
          <input
            name="name"
            required
            className="input w-full"
            placeholder="Tailor's full name"
            autoFocus
          />
        </div>
        <div>
          <label className="label mb-1">Phone</label>
          <input
            name="phone"
            type="tel"
            className="input w-full"
            placeholder="10-digit mobile number"
          />
          <p className="mt-1 text-xs text-gray-400">Used to send production PDF via WhatsApp.</p>
        </div>
        <div>
          <label className="label mb-1">Specialty</label>
          <input
            name="specialty"
            className="input w-full"
            placeholder="e.g. Blouses, Salwar Kameez, Suits"
          />
        </div>
        <div>
          <label className="label mb-1">Notes</label>
          <textarea
            name="notes"
            rows={3}
            className="input w-full"
            placeholder="Any notes about this tailor…"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary">Add Tailor</button>
          <Link href="/tailoring/tailors" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
