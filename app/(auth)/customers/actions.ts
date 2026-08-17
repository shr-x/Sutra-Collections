'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { triggerBirthdayGreetingIfToday } from '@/lib/greetings';
import { createCustomerRecord } from '@/lib/customers';
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const CustomerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).default(''),
  gstin: z
    .string()
    .regex(GSTIN_RE, 'Invalid GSTIN (must be 15-char GST format)')
    .optional()
    .or(z.literal('')),
  credit_limit: z.coerce.number().min(0, 'Credit limit cannot be negative').default(0),
  whatsapp_opt_out: z.boolean().default(false),
  marketing_opt_in: z.boolean().default(true),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export interface CustomerState { error?: string }

function parseCustomerForm(formData: FormData, isAdmin: boolean) {
  const dob  = (formData.get('date_of_birth') as string | null) || null;
  return {
    name: formData.get('name'),
    phone: (formData.get('phone') as string | null) || undefined,
    address: formData.get('address') ?? '',
    gstin: (formData.get('gstin') as string | null) || '',
    credit_limit: isAdmin ? (formData.get('credit_limit') ?? '0') : '0',
    whatsapp_opt_out: formData.get('whatsapp_opt_out') === 'on',
    // Marketing checkbox is checked-by-default; an unchecked box doesn't submit,
    // so absence means opted OUT. Uses a hidden mirror field so we can tell a
    // deliberately-unchecked box from a form that never had the field.
    marketing_opt_in: formData.get('marketing_field_present') === '1'
      ? formData.get('marketing_opt_in') === 'on'
      : true,
    date_of_birth: dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null,
  };
}

export async function createCustomerAction(
  _prev: CustomerState | null,
  formData: FormData
): Promise<CustomerState> {
  const session = await requireRole('admin');

  const parsed = CustomerSchema.safeParse(parseCustomerForm(formData, session.role === 'admin'));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const d = parsed.data;
  try {
    const { id: newId } = await createCustomerRecord({
      name: d.name, phone: d.phone, address: d.address, gstin: d.gstin,
      creditLimit: d.credit_limit, whatsappOptOut: d.whatsapp_opt_out,
      marketingOptIn: d.marketing_opt_in, dateOfBirth: d.date_of_birth,
    });
    logAudit({ userId: session.userId, action: 'create', entityType: 'customer', entityId: newId, entityLabel: d.name }).catch(() => {});
    // If the birthday entered is today, greet immediately (dedup + consent
    // handled inside the helper) rather than waiting for the next daily cron.
    if (d.date_of_birth) {
      triggerBirthdayGreetingIfToday(newId).catch(() => {});
    }
    revalidatePath('/customers');
  } catch {
    return { error: 'Failed to create customer. Please try again.' };
  }
  redirect('/customers');
}

/**
 * Lightweight create used by the invoice builder's inline "new customer" prompt (#5).
 * Returns the new id instead of redirecting so the caller can auto-select it.
 */
export async function quickCreateCustomerAction(
  name: string,
  phone: string
): Promise<{ success: boolean; id?: string; name?: string; phone?: string; error?: string }> {
  await requireRole('admin', 'staff');
  const cleanName = (name ?? '').trim();
  const cleanPhone = (phone ?? '').trim();
  if (!cleanName) return { success: false, error: 'Name is required' };
  try {
    const { id } = await createCustomerRecord({ name: cleanName, phone: cleanPhone || null });
    revalidatePath('/customers');
    return { success: true, id, name: cleanName, phone: cleanPhone || undefined };
  } catch {
    return { success: false, error: 'Failed to create customer. Please try again.' };
  }
}

/**
 * Dedicated entry point for the Customers page's "Add Walk-in Customer" button —
 * store visitors who didn't buy anything but left their name/number. Records
 * source='walk_in' for reporting only; the sutra_store_visit_thankyou welcome
 * send is no longer gated on this — it fires for every customer created via
 * createCustomerRecord (see lib/customers.ts), this path included.
 */
export async function createWalkInCustomerAction(
  name: string,
  phone: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const session = await requireRole('admin', 'staff');
  const cleanName = (name ?? '').trim();
  const cleanPhone = (phone ?? '').trim();
  if (!cleanName) return { success: false, error: 'Name is required' };
  if (!cleanPhone) return { success: false, error: 'Phone number is required to greet walk-in visitors on WhatsApp' };

  let newId: string;
  try {
    const res = await createCustomerRecord({ name: cleanName, phone: cleanPhone, source: 'walk_in' });
    newId = res.id;
  } catch {
    return { success: false, error: 'Failed to save customer. Please try again.' };
  }

  logAudit({ userId: session.userId, action: 'create', entityType: 'customer', entityId: newId, entityLabel: cleanName, newValue: { source: 'walk_in' } }).catch(() => {});
  revalidatePath('/customers');

  return { success: true, id: newId };
}

export async function updateCustomerAction(
  id: string,
  _prev: CustomerState | null,
  formData: FormData
): Promise<CustomerState> {
  const session = await requireRole('admin');

  const parsed = CustomerSchema.safeParse(parseCustomerForm(formData, session.role === 'admin'));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const d = parsed.data;
  try {
    if (session.role === 'admin') {
      await query(
        `UPDATE customers SET name=$1,phone=$2,address=$3,gstin=$4,credit_limit=$5,
         whatsapp_opt_out=$6,marketing_opt_in=$7,date_of_birth=$8 WHERE id=$9`,
        [d.name, d.phone || null, d.address, d.gstin || null, d.credit_limit, d.whatsapp_opt_out, d.marketing_opt_in, d.date_of_birth ?? null, id]
      );
    } else {
      await query(
        `UPDATE customers SET name=$1,phone=$2,address=$3,gstin=$4,
         whatsapp_opt_out=$5,marketing_opt_in=$6,date_of_birth=$7 WHERE id=$8`,
        [d.name, d.phone || null, d.address, d.gstin || null, d.whatsapp_opt_out, d.marketing_opt_in, d.date_of_birth ?? null, id]
      );
    }
    logAudit({ userId: session.userId, action: 'update', entityType: 'customer', entityId: id, entityLabel: d.name }).catch(() => {});
    // Birthday edited to today → greet immediately (dedup prevents a repeat if
    // the cron also runs today).
    if (d.date_of_birth) {
      triggerBirthdayGreetingIfToday(id).catch(() => {});
    }
    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
  } catch {
    return { error: 'Failed to update customer.' };
  }
  redirect(`/customers/${id}`);
}

/**
 * Per-customer "Marketing Messages" toggle used on the Customers list & detail
 * pages. Flips marketing_opt_in. Controls birthday/anniversary greetings and
 * offer broadcasts only — transactional messages are unaffected.
 */
export async function toggleMarketingOptInAction(formData: FormData): Promise<void> {
  const session = await requireRole('admin');
  const id = formData.get('id') as string;
  if (!id) return;
  const res = await query<{ marketing_opt_in: boolean; name: string }>(
    `UPDATE customers SET marketing_opt_in = NOT marketing_opt_in WHERE id=$1 RETURNING marketing_opt_in, name`,
    [id]
  );
  if (res.rows[0]) {
    logAudit({
      userId: session.userId, action: 'update', entityType: 'customer', entityId: id,
      entityLabel: res.rows[0].name, newValue: { marketing_opt_in: res.rows[0].marketing_opt_in },
    }).catch(() => {});
  }
  revalidatePath('/customers');
  revalidatePath(`/customers/${id}`);
}

export async function deleteCustomerAction(formData: FormData) {
  await requireRole('admin');
  const id = formData.get('id') as string;
  try {
    // Anonymise personal data but KEEP the row — invoices FK to this id.
    await query(
      `UPDATE customers SET
         name = 'Deleted User',
         phone = '0000000000',
         address = '',
         gstin = NULL,
         whatsapp_opt_out = TRUE,
         date_of_birth = NULL
       WHERE id = $1`,
      [id]
    );
    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
  } catch (e) {
    console.error('[deleteCustomerAction]', e);
  }
  redirect('/customers');
}

export async function softDeleteCustomerAction(formData: FormData) {
  const session = await requireRole('admin');
  const id = formData.get('id') as string;
  const nameRes = await query<{ name: string }>('SELECT name FROM customers WHERE id=$1', [id]);
  await query(`UPDATE customers SET deleted_at = NOW() WHERE id = $1`, [id]);
  logAudit({ userId: session.userId, action: 'delete', entityType: 'customer', entityId: id, entityLabel: nameRes.rows[0]?.name }).catch(() => {});
  revalidatePath('/customers');
}

export async function restoreCustomerAction(formData: FormData) {
  const session = await requireRole('admin');
  const id = formData.get('id') as string;
  const nameRes = await query<{ name: string }>('SELECT name FROM customers WHERE id=$1', [id]);
  await query(`UPDATE customers SET deleted_at = NULL WHERE id = $1`, [id]);
  logAudit({ userId: session.userId, action: 'update', entityType: 'customer', entityId: id, entityLabel: nameRes.rows[0]?.name, newValue: { restored: true } }).catch(() => {});
  revalidatePath('/customers');
}
