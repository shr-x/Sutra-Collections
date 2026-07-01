import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import SettingsForm from './_settings-form';

interface Setting {
  key: string;
  value: string;
}

export default async function SettingsPage() {
  await requireSA();

  const { rows } = await query<Setting>('SELECT key, value FROM settings ORDER BY key');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings Override</h1>
      <SettingsForm settings={rows} />
    </div>
  );
}
