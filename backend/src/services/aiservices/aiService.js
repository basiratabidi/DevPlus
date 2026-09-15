import dotenv from 'dotenv';
dotenv.config();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// WhatsApp voice notes are normally audio/ogg (opus), but a forwarded/
// shared audio file arrives under the same message type="audio" and can
// be a real mp3/m4a/aac/etc - hardcoding a .ogg filename regardless of
// the actual mime type causes Groq's Whisper endpoint to reject it as
// invalid_media_file (reproduced live - see ai-services/transcribe.py
// for the matching fix on that side).
const MIME_TO_EXTENSION = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
};

function filenameForMimeType(mimeType) {
  const normalized = (mimeType || '').split(';')[0].trim().toLowerCase();
  const extension = MIME_TO_EXTENSION[normalized] || 'ogg';
  return `voice-note.${extension}`;
}

export async function transcribeViaAI(buffer, mimeType = 'audio/ogg') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filenameForMimeType(mimeType));

  const res = await fetch(`${AI_SERVICE_URL}/transcribe`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI service /transcribe failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.text;
}

export async function speakViaAI(text, knownLang = null) {
  const res = await fetch(`${AI_SERVICE_URL}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, known_lang: knownLang }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI service /speak failed: ${res.status} ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}