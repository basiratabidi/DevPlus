import dotenv from 'dotenv';
dotenv.config();

const GRAPH_API_VERSION = 'v25.0';

/**
 * NOTE: This follows the standard two-step Meta media flow (upload media
 * via multipart/form-data to get a media_id, then reference that id in a
 * document message) confirmed against Meta's own Cloud API docs pattern.
 * The exact field names below (messaging_product, file, type) match that
 * pattern, but since I verified this via secondary sources rather than
 * reading Meta's raw reference page directly, sanity-check the first
 * real call and adjust if Meta returns a validation error naming a
 * different field.
 *
 * Node 20 has FormData/Blob globally available, so no extra package
 * (like form-data) is needed for the multipart upload.
 */
export async function sendWhatsAppDocument({ to, buffer, filename, caption }) {
  const uploadUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`;

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    },
    body: form,
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text();
    throw new Error(`Media upload failed: ${uploadResponse.status} ${body}`);
  }

  const { id: mediaId } = await uploadResponse.json();

  const sendUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const sendResponse = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        id: mediaId,
        filename,
        caption,
      },
    }),
  });

  if (!sendResponse.ok) {
    const body = await sendResponse.text();
    throw new Error(`Document send failed: ${sendResponse.status} ${body}`);
  }

  return sendResponse.json();
}