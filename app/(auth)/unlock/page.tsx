import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import PinForm from './pin-form';

export const metadata: Metadata = { title: 'Locked' };

// Middleware rewrites locked Suppliers/Purchases page requests here (the URL
// stays the same), passing the original path in ?next=.
export default async function UnlockPage({ searchParams }: { searchParams: { next?: string } }) {
  await requireAuth();
  const next = searchParams.next ?? '/billing';
  const sectionName = next.startsWith('/suppliers') ? 'Suppliers' : 'Purchases';
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <PinForm next={next} sectionName={sectionName} />
    </div>
  );
}
