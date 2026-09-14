import dotenv from 'dotenv';
dotenv.config();

/**
 * Sends a WhatsApp text message via the official Meta Cloud API.
 * This is the standard, documented endpoint/payload shape:
 * POST https://graph.facebook.com/v25.0/{phone-number-id}/messages
 *
 * NOTE: I'm reasonably confident in this shape since it's Meta's stable
 * documented API, but Meta does bump the graph API version periodically
 * (v25.0 here) - check developers.facebook.com/docs/whatsapp for the
 * current version before deploying, and update GRAPH_API_VERSION if needed.
 */
const GRAPH_API_VERSION = 'v25.0';

// Meta error codes worth calling out by name instead of just dumping the
// raw JSON - these are the ones that have actually bitten this project
// (a credential rotation invalidating something downstream) and are easy
// to mistake for a code bug if all you see is a generic HTTP 401.
const KNOWN_GRAPH_ERROR_CODES = {
  190: 'WHATSAPP_ACCESS_TOKEN is invalid or expired - regenerate the System User token in Meta App dashboard -> System Users, then update WHATSAPP_ACCESS_TOKEN in backend/.env and restart. (Rotating the App Secret can silently invalidate the access token as a side effect - if you just reset WHATSAPP_APP_SECRET, this is likely why.)',
  200: 'Permission denied - the access token is valid but lacks a required permission for this WhatsApp Business Account/phone number.',
  10: 'Permission denied - the access token is missing a required permission.',
  131030: 'Recipient phone number is not in the allowed list for this (test-mode) WhatsApp number - add it under Meta App dashboard -> WhatsApp -> API Setup -> "To" number list.',
  131047: 'Message failed: the 24-hour customer service window has closed for this recipient - they need to message you again before you can send a free-form reply.',
};

function describeGraphApiError(status, bodyText) {
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return `WhatsApp send failed: HTTP ${status} - ${bodyText}`;
  }

  const error = parsed?.error;
  if (!error) {
    return `WhatsApp send failed: HTTP ${status} - ${bodyText}`;
  }

  const known = KNOWN_GRAPH_ERROR_CODES[error.code];
  const base = `WhatsApp send failed: HTTP ${status}, Graph API error code ${error.code} (${error.type}): "${error.message}"${error.fbtrace_id ? ` [fbtrace_id: ${error.fbtrace_id}]` : ''}`;
  return known ? `${base}\n  -> ${known}` : base;
}

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
    throw new Error(describeGraphApiError(response.status, body));
  }

  return response.json();
}