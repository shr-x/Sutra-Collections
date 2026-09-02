/**
 * Single shared insertion point for every "real-time" customer creation flow:
 * the regular Add Customer form, the Add Walk-in Customer button, the inline
 * quick-create prompt in the invoice builder, and the inline create in the
 * tailoring order wizard. Routing all of them through here means the
 * sutra_store_visit_thankyou welcome send only has to live in one place and
 * can never be missed by a new entry point later.
 *
 * Deliberately NOT used by: the AI bulk import routes (customers/billing
 * import — migrating a historical contact list is not "someone just visited
 * the store") or the super-admin console's customer creation (a separate
 * internal tool for one-off admin/DB-style fixes). Those still INSERT
 * directly. See project memory for this scoping decision.
 */
import { query } from '@/lib/db';
import { sendWhatsAppTemplateWithLogoHeader } from '@/lib/whatsapp';

// Thrown by createCustomerRecord when the phone number is already on file for
// another active customer — callers should catch this specifically and
// surface err.message directly (it's already a friendly, user-facing
// string), rather than folding it into a generic "failed to create" message.
export class DuplicatePhoneError extends Error {}

export interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  address?: string;
  gstin?: string | null;
  creditLimit?: number;
  whatsappOptOut?: boolean;
  marketingOptIn?: boolean;
  dateOfBirth?: string | null;
  source?: 'standard' | 'walk_in';
}

export async function createCustomerRecord(input: CreateCustomerInput): Promise<{ id: string }> {
  // App-level pre-check ahead of the DB's unique index (db/migrations/015_customer_phone_unique.sql)
  // — gives a friendly, named error instead of a raw constraint-violation message.
  if (input.phone) {
    const dupe = await query<{ name: string }>(
      `SELECT name FROM customers WHERE phone=$1 AND deleted_at IS NULL LIMIT 1`,
      [input.phone]
    );
    if (dupe.rows[0]) {
      throw new DuplicatePhoneError(`A customer with this phone number already exists (${dupe.rows[0].name}).`);
    }
  }

  const res = await query<{ id: string }>(
    `INSERT INTO customers (name, phone, address, gstin, credit_limit, whatsapp_opt_out, marketing_opt_in, date_of_birth, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      input.name,
      input.phone || null,
      input.address ?? '',
      input.gstin || null,
      input.creditLimit ?? 0,
      input.whatsappOptOut ?? false,
      input.marketingOptIn ?? true,
      input.dateOfBirth ?? null,
      input.source ?? 'standard',
    ]
  );
  const id = res.rows[0].id;

  // "Thanks for visiting" welcome message — fires on every CREATE that goes
  // through this function, regardless of entry point (no source/'walk_in'
  // gate). Never call this from an UPDATE path — it must only fire once, at
  // creation. Consent is still enforced: sendWhatsAppTemplate's
  // canSendMarketing check (DPDP consent + marketing_opt_in + not
  // whatsapp_opt_out) runs before anything goes to Meta, same as every other
  // marketing send. Fire-and-forget so a WhatsApp failure never blocks the
  // customer record from being saved.
  if (input.phone) {
    sendWhatsAppTemplateWithLogoHeader(input.phone, 'sutra_store_visit_thankyou', [input.name], {
      marketingCustomerId: id,
    }).catch((err) => console.error('[createCustomerRecord] welcome WhatsApp send failed:', err));
  }

  return { id };
}
