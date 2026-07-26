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
 * headerImageUrl: optional public HTTPS URL for a static image header (e.g. the
 *   sutra_anniversary_greeting logo). Ignored if pdfPath is also provided — a
 *   template has only one header slot.
 * buttonUrl: override URL for the "Visit website" button. Defaults to the
 *   per-template entry in URL_BUTTON_CONFIG. Pass null to suppress.
 */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  parameters: string[],
  pdfPath?: string | null,
  headerImageUrl?: string | null,
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
  } else if (headerImageUrl) {
    // Image header sent by public link — no upload round-trip needed.
    components.unshift({
      type: 'header',
      parameters: [{ type: 'image', image: { link: headerImageUrl } }],
    });
    console.log(`[WA] Image header attached — url: ${headerImageUrl}`);
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
