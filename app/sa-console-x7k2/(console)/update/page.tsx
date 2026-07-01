import { requireSA } from '@/lib/sa-auth';
import UpdateClient from './_client';
import { getInitialDataAction } from './actions';

export default async function UpdatePage() {
  await requireSA();
  const initial = await getInitialDataAction();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Update System</h1>
      <UpdateClient initialGitHash={initial.gitHash} initialLog={initial.lastLog} />
    </div>
  );
}
