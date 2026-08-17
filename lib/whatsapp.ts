/**
 * Meta WhatsApp Cloud API integration.
 * Env vars required: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 * All numbers sent as 91XXXXXXXXXX (India). Strip non-digits before sending.
 */

import fs from 'fs';
import path from 'path';
import { pool } from '@/lib/db';

export interface WaSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: number;
  skipped?: boolean;
}

/**
 * Consent gate for NON-transactional (marketing) messages — birthday/anniversary
 * greetings and offer broadcasts. A customer must satisfy BOTH DPDP consent AND
 * the marketing opt-in toggle (and not have globally opted out of WhatsApp, and
 * not be soft-deleted) before any marketing message goes out. Transactional
 * messages (invoices, order updates, payment reminders) never pass a
 * marketingCustomerId and are therefore never gated here.
 */
export async function canSendMarketing(customerId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ ok: boolean }>(
      `SELECT (dpdp_consent = 'given'
               AND marketing_opt_in = TRUE
               AND whatsapp_opt_out = FALSE
               AND deleted_at IS NULL) AS ok
       FROM customers WHERE id = $1`,
      [customerId],
    );
    return rows[0]?.ok === true;
  } catch (err) {
    // Fail closed for marketing — never send if consent can't be verified.
    console.error('[WA] canSendMarketing check failed:', err);
    return false;
  }
}

const SETTING_LOGO_MEDIA_ID    = 'whatsapp_logo_media_id';
const SETTING_LOGO_MEDIA_AT    = 'whatsapp_logo_media_uploaded_at';
// Meta doesn't document a hard TTL for uploaded (non-link) media; this is a
// conservative estimate so we proactively refresh well before any real expiry
// rather than relying purely on the retry-on-failure path in
// sendWhatsAppTemplateWithLogoHeader.
const LOGO_MEDIA_TTL_MS = 25 * 24 * 60 * 60 * 1000; // 25 days

async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

function guessImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const map: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  return map[ext] ?? 'image/jpeg';
}

/**
 * WhatsApp media_id for the shop logo, uploaded directly to Meta's Media API
 * (read from disk — wherever settings.company_logo_path points to under
 * public/) rather than sent as a fetchable link. The media_id is cached in
 * `settings` so the same static logo isn't re-uploaded on every send; pass
 * `forceRefresh` to bypass the cache (used by sendWhatsAppTemplateWithLogoHeader
 * when Meta rejects a cached id, e.g. because it expired).
 * Returns null if no logo is configured, the file is missing, or the upload
 * fails, so callers can skip the header gracefully.
 */
export async function getLogoMediaId(forceRefresh = false): Promise<string | null> {
  const { rows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key = ANY($1)`,
    [[ 'company_logo_path', SETTING_LOGO_MEDIA_ID, SETTING_LOGO_MEDIA_AT ]]
  );
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const logoPath = s.company_logo_path ?? '';
  if (!logoPath) return null;

  if (!forceRefresh && s[SETTING_LOGO_MEDIA_ID]) {
    const uploadedAt = s[SETTING_LOGO_MEDIA_AT] ? new Date(s[SETTING_LOGO_MEDIA_AT]).getTime() : 0;
    if (Date.now() - uploadedAt < LOGO_MEDIA_TTL_MS) {
      return s[SETTING_LOGO_MEDIA_ID];
    }
  }

  const absPath = path.join(process.cwd(), 'public', logoPath);
  if (!fs.existsSync(absPath)) {
    console.warn('[WA] Logo file not found on disk for media upload:', absPath);
    return null;
  }

  const mediaId = await uploadWhatsAppMediaFile(absPath, guessImageMimeType(absPath));
  if (!mediaId) return null;

  await setSetting(SETTING_LOGO_MEDIA_ID, mediaId);
  await setSetting(SETTING_LOGO_MEDIA_AT, new Date().toISOString());
  return mediaId;
}

export function interpolateTemplate(
  template: string,
  vars: { name: string; invoice_number: string; amount: string; days: string }
): string {
  return template
    .replace(/\{\{name\}\}/g, vars.name)
    .replace(/\{\{invoice_number\}\}/g, vars.invoice_number)
    .replace(/\{\{amount\}\}/g, vars.amount)
    .replace(/\{\{days\}\}/g, vars.days);
}

async function postToMeta(body: object): Promise<WaSendResult> {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    console.warn('[WA] Not configured — set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID');
    return { success: false, error: 'WhatsApp not configured' };
  }

  // Log the complete outgoing payload so we can verify component structure
  console.log('[WA] POST /messages payload:', JSON.stringify(body, null, 2));

  let res: Response;
  try {
    res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  } catch (err) {
    console.error('[WA] Fetch error:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }

  const data = await res.json().catch(() => ({})) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
  };

  if (!res.ok) {
    // Log full Meta error object — code+subcode are critical for debugging #131008
    console.error('[WA] API error HTTP', res.status, JSON.stringify(data.error ?? data));
    return { success: false, error: data.error?.message ?? `HTTP ${res.status}`, errorCode: data.error?.code };
  }

  const msgId = data.messages?.[0]?.id;
  console.log('[WA] Message sent — id:', msgId);
  return { success: true, messageId: msgId };
}

function normalisePhone(toPhone: string): string {
  const digits = toPhone.replace(/\D/g, '');
  return digits.startsWith('91') && digits.length === 12 ? digits : `91${digits}`;
}

/**
 * Upload a local file to the WhatsApp media API and return the media_id.
 * Returns null on any failure so callers can send body-only (or link-based
 * fallback) rather than blocking the whole message.
 */
async function uploadWhatsAppMediaFile(filePath: string, mimeType: string): Promise<string | null> {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return null;

  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
  } catch (err) {
    console.error('[WA Media] Cannot read file:', filePath, (err as Error).message);
    return null;
  }

  const fileName = path.basename(filePath);
  console.log(`[WA Media] Uploading ${fileName} (${fileBuffer.length} bytes, type=${mimeType})`);

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');   // required by Meta
  form.append('type', mimeType);
  form.append('file', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName);

  let res: Response;
  try {
    res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );
  } catch (err) {
    console.error('[WA Media] Fetch error:', (err as Error).message);
    return null;
  }

  const data = await res.json().catch(() => ({})) as {
    id?: string;
    error?: { message?: string; code?: number; fbtrace_id?: string };
  };

  if (!res.ok || !data.id) {
    console.error('[WA Media] Upload FAILED — HTTP', res.status, JSON.stringify(data.error ?? data));
    return null;
  }

  console.log('[WA Media] Upload OK — media_id:', data.id);
  return data.id;
}

/**
 * Templates that have a "Visit website" button with a DYNAMIC URL parameter ({{1}}
 * in the button's url, shown as an `example` array on the button in the live template).
 * `index` is the button's 0-based position among ALL buttons on the approved template.
 *
 * All 15 sutra_* templates were fetched live from Meta (GET .../message_templates) and
 * audited component-by-component. Every "URL" button found (invoice_notification,
 * payment_received, order_confirmation, order_delivered, low_stock_alert,
 * birthday_greeting, anniversary_greeting) is fully static — no {{1}} placeholder, no
 * example array. Several templates assumed to have a URL button don't have one at all
 * (payment_reminder has only a static PHONE_NUMBER button; refund_issued has no
 * BUTTONS component whatsoever). Sending a button component for a button with zero
 * declared variables — or for a template with no button at all — is exactly what
 * produces Meta error #132018 ("issue with the parameters in your template").
 *
 * This map is intentionally EMPTY as of the last live audit — do not add an entry
 * without first confirming the live template has a genuine {{1}}/example in that
 * button's url.
 */
const URL_BUTTON_CONFIG: Record<string, { index: string; url: string }> = {};

/**
 * Send a Meta-approved template message.
 * parameters: ordered text values for body {{1}}, {{2}}, …
 * pdfPath: optional absolute path to a PDF — uploaded as document header if the
 *   template was approved with a Document header. On upload failure, falls back
 *   to body-only so the message still goes out.
 * headerImageMediaId: optional WhatsApp media_id (from the Media API — see
 *   getLogoMediaId/uploadWhatsAppMediaFile) for a static image header, e.g.
 *   the sutra_anniversary_greeting / sutra_store_visit_thankyou logo. Ignored
 *   if pdfPath is also provided — a template has only one header slot.
 * buttonUrl: override URL for the "Visit website" button. Defaults to the
 *   per-template entry in URL_BUTTON_CONFIG. Pass null to suppress.
 * opts.marketingCustomerId: mark this as a MARKETING send for the given customer.
 *   When set, the DPDP + marketing-opt-in consent gate (canSendMarketing) is
 *   enforced here before anything is sent to Meta; if the customer hasn't
 *   consented the send is skipped (returns { success:false, skipped:true }).
 *   Transactional sends omit this and are never gated.
 */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  parameters: string[],
  pdfPath?: string | null,
  headerImageMediaId?: string | null,
  buttonUrl?: string | null,
  opts?: { marketingCustomerId?: string | null }
): Promise<WaSendResult> {
  console.log(`[WA] sendWhatsAppTemplate: template="${templateName}" params=${parameters.length} pdf=${pdfPath ? 'yes' : 'none'}`);

  // Marketing consent gate — enforced centrally so no marketing send can bypass
  // it regardless of call site.
  if (opts?.marketingCustomerId) {
    const allowed = await canSendMarketing(opts.marketingCustomerId);
    if (!allowed) {
      console.log(`[WA] Skipped marketing "${templateName}" — customer ${opts.marketingCustomerId} not consented/opted-in`);
      return { success: false, skipped: true, error: 'Customer not opted in to marketing messages' };
    }
  }

  // Body component is always present
  const components: object[] = [
    {
      type: 'body',
      parameters: parameters.map((text) => ({ type: 'text', text })),
    },
  ];

  // If a PDF is provided, upload it and prepend a document header component.
  // If the upload fails for any reason, fall back to body-only — never block the send.
  if (pdfPath) {
    const mediaId = await uploadWhatsAppMediaFile(pdfPath, 'application/pdf');
    if (mediaId) {
      components.unshift({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              id: mediaId,
              filename: path.basename(pdfPath),  // filename is required by Meta
            },
          },
        ],
      });
      console.log(`[WA] Document header attached — media_id: ${mediaId}`);
    } else {
      console.warn(`[WA] PDF upload failed for "${templateName}" — continuing without document header`);
    }
  } else if (headerImageMediaId) {
    // Image header by uploaded media_id — Meta serves it from their own
    // storage rather than fetching a link at send time.
    components.unshift({
      type: 'header',
      parameters: [{ type: 'image', image: { id: headerImageMediaId } }],
    });
    console.log(`[WA] Image header attached — media_id: ${headerImageMediaId}`);
  }

  // Button component — required for templates with a "Visit website" URL button.
  // Auto-inject the per-template default from URL_BUTTON_CONFIG; allow override via buttonUrl param.
  const buttonConfig = URL_BUTTON_CONFIG[templateName];
  const effectiveButtonUrl = buttonUrl !== undefined ? buttonUrl : buttonConfig?.url ?? null;
  if (effectiveButtonUrl) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: buttonConfig?.index ?? '0',
      parameters: [{ type: 'text', text: effectiveButtonUrl }],
    });
    console.log(`[WA] Button component added — index: ${buttonConfig?.index ?? '0'} url: ${effectiveButtonUrl}`);
  }

  const buildBody = (comps: object[]) => ({
    messaging_product: 'whatsapp',
    to: normalisePhone(toPhone),
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: comps,
    },
  });

  let result = await postToMeta(buildBody(components));

  // #132012 "Format mismatch, expected DOCUMENT, received UNKNOWN" — Meta
  // sometimes hasn't finished indexing a media file for message-sending use
  // milliseconds after the upload call returns, even though the media_id is
  // already valid (confirmed via the Media API). Empirically confirmed: the
  // identical request, retried a few seconds later with the SAME media_id
  // (no re-upload), succeeds. Retry once rather than losing the message.
  if (!result.success && result.errorCode === 132012) {
    console.warn(`[WA] "${templateName}" hit #132012 (media not yet propagated) — retrying once in 3s`);
    await new Promise((r) => setTimeout(r, 3000));
    result = await postToMeta(buildBody(components));
  }

  // #132018 "Template does not contain title component, no parameters
  // allowed" — the live approved template genuinely has no header slot, but
  // we attached one (PDF or image). Retry body-only so the customer still
  // gets the message text instead of nothing.
  if (!result.success && result.errorCode === 132018) {
    const hasHeader = components.some((c) => (c as { type?: string }).type === 'header');
    if (hasHeader) {
      console.warn(`[WA] "${templateName}" has no approved header component — retrying without attachment`);
      const bodyOnlyComponents = components.filter((c) => (c as { type?: string }).type !== 'header');
      result = await postToMeta(buildBody(bodyOnlyComponents));
    }
  }

  return result;
}

/**
 * Send a template whose approved header is the shop logo image — used by
 * sutra_anniversary_greeting and sutra_store_visit_thankyou. Resolves the
 * cached logo media_id (getLogoMediaId), sends, and if Meta rejects the send
 * (e.g. the cached media_id expired/was invalidated) retries exactly once
 * with a freshly re-uploaded media_id. Falls back to sending without a header
 * (never silently drops the message) if no logo is configured or upload fails.
 */
export async function sendWhatsAppTemplateWithLogoHeader(
  toPhone: string,
  templateName: string,
  parameters: string[],
  opts?: { marketingCustomerId?: string | null }
): Promise<WaSendResult> {
  const mediaId = await getLogoMediaId();
  if (!mediaId) {
    return sendWhatsAppTemplate(toPhone, templateName, parameters, null, null, null, opts);
  }

  let result = await sendWhatsAppTemplate(toPhone, templateName, parameters, null, mediaId, null, opts);
  if (result.skipped) return result; // consent gate declined — not a media problem, don't retry

  if (!result.success) {
    console.warn(`[WA] "${templateName}" failed with cached logo media_id (${mediaId}) — re-uploading and retrying once`);
    const freshMediaId = await getLogoMediaId(true);
    if (freshMediaId && freshMediaId !== mediaId) {
      result = await sendWhatsAppTemplate(toPhone, templateName, parameters, null, freshMediaId, null, opts);
    }
  }

  return result;
}

/**
 * Send free-form text (only valid within a 24-hour customer-initiated session).
 */
export async function sendWhatsAppText(
  toPhone: string,
  message: string
): Promise<WaSendResult> {
  return postToMeta({
    messaging_product: 'whatsapp',
    to: normalisePhone(toPhone),
    type: 'text',
    text: { body: message, preview_url: false },
  });
}

export async function sendHelloWorld(toPhone: string): Promise<WaSendResult> {
  return postToMeta({
    messaging_product: 'whatsapp',
    to: normalisePhone(toPhone),
    type: 'template',
    template: {
      name: 'hello_world',
      language: { code: 'en_US' },
    },
  });
}
