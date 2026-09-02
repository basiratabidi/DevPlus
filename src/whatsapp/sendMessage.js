import dotenv from 'dotenv';
dotenv.config();

/**
 * Sends a WhatsApp text message via the official Meta Cloud API.
 * This is the standard, documented endpoint/payload shape:
 * POST https://graph.facebook.com/v21.0/{phone-number-id}/messages
 *
 * NOTE: I'm reasonably confident in this shape since it's Meta's stable
 * documented API, but Meta does bump the graph API version periodically
 * (v21.0 here) - check developers.facebook.com/docs/whatsapp for the
 * current version before deploying, and update GRAPH_API_VERSION if needed.
 */
const GRAPH_API_VERSION = 'v25.0';

export async function sendWhatsAppMessage({ to, text }) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp send failed: ${response.status} ${body}`);
  }

  return response.json();
}