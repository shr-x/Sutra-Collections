'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { PRODUCTION_COLUMN_KEYS, setGroupCollapsed } from '@/lib/production-board-collapsed';

const CollapseSchema = z.object({
  column: z.enum(PRODUCTION_COLUMN_KEYS),
  customerId: z.string().uuid(),
  collapsed: z.boolean(),
});

// Saves one customer group's collapsed/expanded state for the signed-in admin.
export async function setProductionGroupCollapsedAction(input: {
  column: string;
  customerId: string;
  collapsed: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole('admin');
  const parsed = CollapseSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid group' };

  try {
    await setGroupCollapsed(
      session.userId,
      parsed.data.column,
      parsed.data.customerId,
      parsed.data.collapsed,
    );
    return { success: true };
  } catch (err) {
    console.error('[production-board] save collapsed state failed:', err);
    return { success: false, error: 'Could not save. Please try again.' };
  }
}
