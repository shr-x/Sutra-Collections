import type { Metadata } from 'next';
import { hasShrxSession } from '@/lib/shrx/session';
import { isShrxPasswordConfigured } from '@/lib/shrx/password';
import ShrxLogin from './login';
import ShrxConsole from './console';

export const metadata: Metadata = { title: 'SHRX', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// Standalone owner console. Deliberately outside the (auth) group and carved
// out of the auth middleware: it needs no app login, only the SHRX password.
export default async function ShrxPage() {
  const authed = await hasShrxSession();
  return (
    <div className="min-h-screen bg-gray-50">
      {authed ? <ShrxConsole /> : <ShrxLogin configured={isShrxPasswordConfigured()} />}
    </div>
  );
}
