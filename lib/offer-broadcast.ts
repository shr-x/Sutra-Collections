/**
 * Discount-scheme offer broadcast.
 *
 * Sends the Meta-approved `sutra_offer_broadcast` template (Image header +
 * 3 body vars: {{1}} name, {{2}} offer summary, {{3}} validity) to every
 * marketing-opted-in customer, one at a time, logging each outcome to
 * offer_broadcast_log. Fire-and-forget batch style (the app runs as a
 * persistent Node server, so a detached promise keeps running after the
 * request returns). Guarded by discount_schemes.broadcast_sent_at so a scheme
 * broadcasts at most once — re-saving an already-broadcast scheme never
 * re-sends to the whole customer base.
 */

import { pool } from '@/lib/db';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Human-readable offer summary from the scheme's discount type/amount → {{2}}. */
function offerSummary(s: {
  name: string; scheme_type: string; discount_value: string | null;
  buy_quantity: string | null; get_quantity: string | null;
}): string {
  const v = s.discount_value ? Number(s.discount_value) : 0;
  switch (s.scheme_type) {
    case 'percent':
    case 'seasonal':
      return v > 0 ? `${v}% OFF` : s.name;
    case 'flat':
      return v > 0 ? `Rs. ${v} OFF` : s.name;
    case 'buy_x_get_y': {
      const b = s.buy_quantity ? Number(s.buy_quantity) : 1;
      const g = s.get_quantity ? Number(s.get_quantity) : 1;
      return `Buy ${b} Get ${g} Free`;
    }
    default:
      return s.name;
  }
}

/** Validity line → {{3}}. */
function validityLine(validFrom: string | null, validUntil: string | null): string {
  const from = fmtDate(validFrom);
  const until = fmtDate(validUntil);
  if (from && until) return `Valid ${from} – ${until}`;
  if (until) return `Valid till ${until}`;
  if (from) return `Valid from ${from}`;
  return 'Limited time offer';
}

export interface BroadcastResult { total: number; sent: number; skipped: number; failed: number }

/**
 * Broadcast a scheme's offer. Safe to call detached. Returns a summary (also
 * useful for a synchronous test). No-op unless the scheme is Active, has an
 * offer image, and hasn't already been broadcast.
 *
 * testCustomerId: when set, sends ONLY to that one customer (still gated by
 * canSendMarketing / consent) instead of the whole customer base, and does
 * NOT set broadcast_sent_at or consume the scheme's one real send — lets an
 * admin (or a verification pass) preview exactly what a broadcast will look
 * like before firing it at every customer.
 */
export async function broadcastOffer(schemeId: string, testCustomerId?: string): Promise<BroadcastResult> {
  const result: BroadcastResult = { total: 0, sent: 0, skipped: 0, failed: 0 };
  try {
    const schemeRes = await pool.query<{
      name: string; scheme_type: string; discount_value: string | null;
      buy_quantity: string | null; get_quantity: string | null;
      valid_from: string | null; valid_until: string | null;
      offer_image_path: string | null; is_active: boolean; broadcast_sent_at: string | null;
    }>(
      `SELECT name, scheme_type, discount_value::text, buy_quantity::text, get_quantity::text,
              valid_from::text, valid_until::text, offer_image_path, is_active, broadcast_sent_at::text
       FROM discount_schemes WHERE id = $1`,
      [schemeId],
    );
    const s = schemeRes.rows[0];
    if (!s) return result;
    // Guards: never broadcast a Draft, a scheme with no banner image (the
    // template requires an image header), or one already broadcast.
    if (!s.is_active) { console.log(`[broadcastOffer] scheme ${schemeId} is Draft — not sending`); return result; }
    if (!s.offer_image_path) { console.warn(`[broadcastOffer] scheme ${schemeId} has no image — skipping broadcast`); return result; }
    // A test/preview send bypasses the "already broadcast" guard (and never
    // sets broadcast_sent_at), so it can't consume the scheme's one real send.
    if (!testCustomerId && s.broadcast_sent_at) { console.log(`[broadcastOffer] scheme ${schemeId} already broadcast — skipping`); return result; }

    const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    if (appBaseUrl.includes('localhost') || appBaseUrl.includes('127.0.0.1')) {
      console.warn(`[broadcastOffer] NEXT_PUBLIC_APP_URL is "${appBaseUrl}" — Meta cannot fetch header images from a localhost URL; the message will send but the image will not load for recipients.`);
    }
    const imageUrl = `${appBaseUrl}/${s.offer_image_path.replace(/^\//, '')}`;
    const summary = offerSummary(s);
    const validity = validityLine(s.valid_from, s.valid_until);

    if (testCustomerId) {
      console.log(`[broadcastOffer] TEST MODE — scheme ${schemeId} → single customer ${testCustomerId} only, broadcast_sent_at NOT set`);
    } else {
      // Mark as broadcast up front so a concurrent re-save can't double-send.
      await pool.query(`UPDATE discount_schemes SET broadcast_sent_at = NOW() WHERE id = $1`, [schemeId]);
    }

    const custRes = testCustomerId
      ? await pool.query<{ id: string; name: string; phone: string }>(
          `SELECT id, name, phone FROM customers
           WHERE id = $1
             AND phone IS NOT NULL AND phone <> ''
             AND whatsapp_opt_out = FALSE
             AND marketing_opt_in = TRUE
             AND dpdp_consent = 'given'
             AND deleted_at IS NULL
             AND is_active = TRUE`,
          [testCustomerId],
        )
      : await pool.query<{ id: string; name: string; phone: string }>(
          `SELECT id, name, phone FROM customers
           WHERE phone IS NOT NULL AND phone <> ''
             AND whatsapp_opt_out = FALSE
             AND marketing_opt_in = TRUE
             AND dpdp_consent = 'given'
             AND deleted_at IS NULL
             AND is_active = TRUE`,
        );
    result.total = custRes.rows.length;

    for (const cust of custRes.rows) {
      try {
        const res = await sendWhatsAppTemplate(
          cust.phone,
          'sutra_offer_broadcast',
          [cust.name, summary, validity],
          null,
          imageUrl,
          null,
          { marketingCustomerId: cust.id },
        );
        if (res.success) {
          result.sent++;
          await pool.query(
            `INSERT INTO offer_broadcast_log (scheme_id, customer_id, status) VALUES ($1,$2,'sent')`,
            [schemeId, cust.id],
          );
        } else if (res.skipped) {
          result.skipped++;
          await pool.query(
            `INSERT INTO offer_broadcast_log (scheme_id, customer_id, status, error) VALUES ($1,$2,'skipped',$3)`,
            [schemeId, cust.id, res.error ?? 'skipped'],
          );
        } else {
          result.failed++;
          await pool.query(
            `INSERT INTO offer_broadcast_log (scheme_id, customer_id, status, error) VALUES ($1,$2,'failed',$3)`,
            [schemeId, cust.id, res.error ?? 'unknown'],
          );
        }
      } catch (err) {
        result.failed++;
        await pool.query(
          `INSERT INTO offer_broadcast_log (scheme_id, customer_id, status, error) VALUES ($1,$2,'failed',$3)`,
          [schemeId, cust.id, err instanceof Error ? err.message : String(err)],
        ).catch(() => {});
      }
    }

    console.log(`[broadcastOffer] scheme ${schemeId}: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed of ${result.total}`);
  } catch (err) {
    console.error('[broadcastOffer] failed:', err);
  }
  return result;
}
