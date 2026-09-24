'use server';

import { z } from 'zod';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const OrderSchema = z.array(z.string()).max(50);

export async function saveSidebarOrderAction(order: string[]): Promise<{ success: boolean }> {
  const session = await requireAuth();
  const parsed = OrderSchema.safeParse(order);
  if (!parsed.success) return { success: false };

  await query('UPDATE users SET sidebar_order=$1 WHERE id=$2', [JSON.stringify(parsed.data), session.userId]);
  return { success: true };
}
