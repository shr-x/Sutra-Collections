import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ROLE_HOME } from '@/lib/auth';
import LoginForm from './login-form';

export const metadata: Metadata = { title: 'Sign In' };

interface Props {
  searchParams: { reason?: string };
}

export default async function LoginPage({ searchParams }: Props) {
  // Already logged in — go home
  const session = await getSession();
  if (session) redirect(ROLE_HOME[session.role]);

  const reasonMsg: Record<string, string> = {
    access_expired: 'Your time-boxed access has expired. Contact the administrator.',
    unauthorized: 'You do not have permission to access that page.',
  };

  const notice = searchParams.reason ? reasonMsg[searchParams.reason] : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-700 text-2xl font-bold text-white shadow-lg">
            S
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sutra Collections</h1>
          <p className="mt-1 text-sm text-gray-500">Internal Management System</p>
        </div>

        <div className="card">
          <h2 className="mb-6 text-lg font-semibold text-gray-800">Sign in to your account</h2>

          {notice && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              {notice}
            </div>
          )}

          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Sutra Collections ERP &mdash; Internal use only
        </p>
      </div>
    </div>
  );
}
