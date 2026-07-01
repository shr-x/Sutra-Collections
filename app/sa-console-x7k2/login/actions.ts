'use server';

import { saLogin, saLogout } from '@/lib/sa-auth';
import { redirect } from 'next/navigation';

export interface SALoginState {
  error?: string;
}

export async function saLoginAction(
  _prevState: SALoginState | null,
  formData: FormData
): Promise<SALoginState> {
  const username = (formData.get('username') as string | null)?.trim() ?? '';
  const password = (formData.get('password') as string | null) ?? '';

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }

  const result = await saLogin(username, password);
  if (result.success) redirect('/sa-console-x7k2');
  return { error: result.error ?? 'Login failed.' };
}

export async function saLogoutAction(): Promise<void> {
  await saLogout();
  redirect('/sa-console-x7k2/login');
}
