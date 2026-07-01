/**
 * Meta WhatsApp Cloud API integration.
 * Env vars required: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 * All numbers sent as 91XXXXXXXXXX (India). Strip non-digits before sending.
 */

import fs from 'fs';
import path from 'path';

export interface WaSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
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
    return { success: false, error: data.error?.message ?? `HTTP ${res.status}` };
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
 * Upload a PDF to the WhatsApp media API and return the media_id.
 * Returns null on any failure so callers can send body-only as fallback.
 */
async function uploadWhatsAppMedia(pdfPath: string): Promise<string | null> {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return null;

  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(pdfPath);
  } catch (err) {
    console.error('[WA Media] Cannot read file:', pdfPath, (err as Error).message);
    return null;
  }

  const fileName = path.basename(pdfPath);
  console.log(`[WA Media] Uploading ${fileName} (${fileBuffer.length} bytes)`);
  console.log('[WA Media] Form fields: messaging_product=whatsapp, type=application/pdf, file=<buffer>');

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');   // required by Meta
  form.append('type', 'application/pdf');          // MIME type of the file
  form.append('file', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), fileName);

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
 * Templates that have a "Visit website" button with a dynamic URL parameter ({{1}}).
 * These require a button component; templates not in this set have no button slot.
 */
const TEMPLATES_WITH_URL_BUTTON = new Set([
  'sutra_invoice_notification',
  'sutra_payment_reminder',
  'sutra_payment_received',
  'sutra_refund_issued',
  'sutra_order_confirmation',
  'sutra_low_stock_alert',
  'sutra_birthday_greeting',
  'sutra_anniversary_greeting',
  // Call/no button: sutra_order_ready, sutra_order_delivered, sutra_invoice_cancelled,
  //                 sutra_debit_note_issued, sutra_tailor_assignment,
  //                 sutra_order_updated, sutra_tailor_removed
]);

/**
 * Send a Meta-approved template message.
 * parameters: ordered text values for body {{1}}, {{2}}, …
 * pdfPath: optional absolute path to a PDF — uploaded as document header if the
 *   template was approved with a Document header. On upload failure, falls back
 *   to body-only so the message still goes out.
 * buttonUrl: override URL for the "Visit website" button. Defaults to https://shr-x.in
 *   for all templates in TEMPLATES_WITH_URL_BUTTON. Pass null to suppress.
 */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  parameters: string[],
  pdfPath?: string | null,
  buttonUrl?: string | null
): Promise<WaSendResult> {
  console.log(`[WA] sendWhatsAppTemplate: template="${templateName}" params=${parameters.length} pdf=${pdfPath ? 'yes' : 'none'}`);

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
    const mediaId = await uploadWhatsAppMedia(pdfPath);
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
  }

  // Button component — required for templates with a "Visit website" URL button.
  // Auto-inject https://shr-x.in for known templates; allow override via buttonUrl param.
  const effectiveButtonUrl = buttonUrl !== undefined
    ? buttonUrl
    : TEMPLATES_WITH_URL_BUTTON.has(templateName) ? 'https://shr-x.in' : null;
  if (effectiveButtonUrl) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: effectiveButtonUrl }],
    });
    console.log(`[WA] Button component added — url: ${effectiveButtonUrl}`);
  }

  const body = {
    messaging_product: 'whatsapp',
    to: normalisePhone(toPhone),
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components,
    },
  };

  return postToMeta(body);
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
