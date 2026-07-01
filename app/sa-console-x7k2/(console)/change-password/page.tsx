import { requireSA } from '@/lib/sa-auth';
import { ChangePasswordForm } from './_form';

export default async function ChangePasswordPage() {
  await requireSA();

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold text-white">Change Password</h1>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
