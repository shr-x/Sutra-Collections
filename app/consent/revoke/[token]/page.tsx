import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sutra Collections' };

export default function RevokeConsentPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">Sutra Collections</h1>
        <div className="mt-4">
          <p className="text-sm text-gray-600">
            This link is no longer active. Please contact the store if you need help with your
            WhatsApp preferences.
          </p>
        </div>
      </div>
    </main>
  );
}
