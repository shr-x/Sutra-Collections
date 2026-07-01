import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ROLE_HOME } from '@/lib/auth';

// Root "/" — redirect to role home or /login
export default async function RootPage() {
  const session = await getSession();
  if (session) {
    redirect(ROLE_HOME[session.role]);
  }
  redirect('/login');
}
