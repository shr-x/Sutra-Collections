'use client';

import { useTour } from './tour-context';

export default function TourSettingsSection() {
  const { startTour } = useTour();

  function handleReset() {
    try {
      localStorage.removeItem('sutra_tour_step');
      localStorage.removeItem('sutra_tour_active');
      localStorage.removeItem('sutra_tour_completed');
      alert('Tour progress has been reset. Click "Start Interactive Tour" to begin again.');
    } catch { /* ignore */ }
  }

  return (
    <div data-tour="settings-help" className="mt-6 rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-2xl">🎯</span>
        <div>
          <h2 className="text-base font-bold text-gray-900">Help &amp; Onboarding</h2>
          <p className="text-xs text-gray-500">Take a guided walkthrough of all features in Sutra Collections</p>
        </div>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        Not sure where to start? The interactive tour covers all 42 features — Billing, Inventory, Tailoring, Accounting, Reports, and Settings. Takes about 5 minutes.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => startTour(0)}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800 transition-colors"
        >
          🎯 Start Interactive Tour
        </button>
        <button
          onClick={handleReset}
          className="text-sm text-gray-400 underline hover:text-gray-600 transition-colors"
        >
          Reset Tour Progress
        </button>
      </div>
    </div>
  );
}
