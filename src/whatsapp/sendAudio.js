import dotenv from 'dotenv';
dotenv.config();

const GRAPH_API_VERSION = 'v25.0';

export async function sendWhatsAppAudio({ to, buffer }) {
  const uploadUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`;

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buffer], { type: 'audio/mpeg' }), 'reply.mp3');

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    },
    body: form,
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text();
    throw new Error(`Audio upload failed: ${uploadResponse.status} ${body}`);
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
      type: 'audio',
      audio: { id: mediaId },
    }),
  });

  if (!sendResponse.ok) {
    const body = await sendResponse.text();
    throw new Error(`Audio send failed: ${sendResponse.status} ${body}`);
  }

  return sendResponse.json();
}
