import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendWhatsAppText } from '@/lib/whatsapp';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WaTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text';
  text: { body: string };
}

interface WaOtherMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
}

type WaMessage = WaTextMessage | WaOtherMessage;

interface WaWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value?: {
        messages?: WaMessage[];
        metadata?: { display_phone_number: string; phone_number_id: string };
      };
    }>;
  }>;
}

// ── GET — webhook verification ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode');
  const token     = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// ── POST — incoming message handler ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  let payload: WaWebhookPayload;
  try {
    payload = (await req.json()) as WaWebhookPayload;
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  // Return 200 immediately — Meta requires a fast response
  // Process async without blocking the response
  handleIncoming(payload).catch((err) =>
    console.error('[WH] Async processing error:', err)
  );

  return NextResponse.json({ success: true });
}

// ── Async processing ──────────────────────────────────────────────────────────

async function handleIncoming(payload: WaWebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account') return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      for (const msg of change.value?.messages ?? []) {
        await processMessage(msg, payload);
      }
    }
  }
}

async function processMessage(msg: WaMessage, rawPayload: WaWebhookPayload): Promise<void> {
  const fromPhone   = msg.from;
  const messageId   = msg.id;
  const messageType = msg.type;
  const messageText = messageType === 'text' ? (msg as WaTextMessage).text?.body ?? null : null;

  // Deduplicate by whatsapp_message_id
  const existing = await query(
    'SELECT id FROM whatsapp_incoming_messages WHERE whatsapp_message_id=$1',
    [messageId]
  );
  if (existing.rows.length > 0) return;

  // Try to match customer by phone (strip leading 91 for comparison)
  const normalised = fromPhone.replace(/^91/, '');
  const custRes = await query<{ id: string; name: string; credit_limit: number }>(
    `SELECT id, name, credit_limit FROM customers
     WHERE (phone=$1 OR phone=$2) AND deleted_at IS NULL LIMIT 1`,
    [fromPhone, normalised]
  );
  const customer = custRes.rows[0] ?? null;

  // Log to DB
  await query(
    `INSERT INTO whatsapp_incoming_messages
       (from_phone, message_type, message_text, whatsapp_message_id, customer_id, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [fromPhone, messageType, messageText, messageId, customer?.id ?? null, JSON.stringify(rawPayload)]
  );

  // Only handle text messages for auto-reply
  if (messageType !== 'text' || !messageText) return;

  const keyword = messageText.trim().toUpperCase();

  if (keyword === 'STOP') {
    await query(
      `UPDATE customers SET whatsapp_opt_out=TRUE WHERE phone=$1 OR phone=$2`,
      [fromPhone, normalised]
    );
    await sendWhatsAppText(
      fromPhone,
      'You have been unsubscribed from Sutra Collections WhatsApp messages. Reply START to resubscribe.'
    );
    await markProcessed(messageId);

  } else if (keyword === 'START') {
    await query(
      `UPDATE customers SET whatsapp_opt_out=FALSE WHERE phone=$1 OR phone=$2`,
      [fromPhone, normalised]
    );
    await sendWhatsAppText(
      fromPhone,
      'Welcome back! You will now receive updates from Sutra Collections.'
    );
    await markProcessed(messageId);

  } else if (keyword === 'BAL' || keyword === 'BALANCE') {
    if (customer) {
      const balRes = await query<{ outstanding: string }>(
        `SELECT COALESCE(SUM(grand_total - amount_paid), 0)::text AS outstanding
         FROM invoices WHERE customer_id=$1 AND status NOT IN ('cancelled','draft')`,
        [customer.id]
      );
      const outstanding = parseFloat(balRes.rows[0]?.outstanding ?? '0').toFixed(2);
      await sendWhatsAppText(
        fromPhone,
        `Hi ${customer.name}, your outstanding balance at Sutra Collections is Rs.${outstanding}. Thank you!`
      );
    } else {
      await sendWhatsAppText(fromPhone, 'Sorry, we could not find your account. Please contact Sutra Collections for assistance.');
    }
    await markProcessed(messageId);
  }
  // All other messages: log only, no auto-reply
}

async function markProcessed(messageId: string): Promise<void> {
  await query(
    'UPDATE whatsapp_incoming_messages SET processed=TRUE WHERE whatsapp_message_id=$1',
    [messageId]
  );
}
