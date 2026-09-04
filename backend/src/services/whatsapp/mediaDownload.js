import dotenv from 'dotenv';
dotenv.config();

const GRAPH_API_VERSION = 'v25.0';

/**
 * Downloads a WhatsApp media file (voice note, image, etc.) via Meta's
 * 2-step media fetch: first resolve the media ID to a temporary URL,
 * then download the binary from that URL using the same access token.
 *
 * NOTE: the media URL Meta returns is short-lived (expires within
 * minutes), so it must be fetched immediately - don't cache the URL.
 */
export async function downloadMedia(mediaId) {
  const metaResponse = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
    }
  );

  if (!metaResponse.ok) {
    const body = await metaResponse.text();
    throw new Error(`Media metadata fetch failed: ${metaResponse.status} ${body}`);
  }

  const { url, mime_type: mimeType } = await metaResponse.json();

  const fileResponse = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    },
  });

  if (!fileResponse.ok) {
    const body = await fileResponse.text();
    throw new Error(`Media download failed: ${fileResponse.status} ${body}`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

