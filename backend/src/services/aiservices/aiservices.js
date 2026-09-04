import dotenv from 'dotenv';
dotenv.config();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

export async function transcribeViaAI(buffer, mimeType = 'audio/ogg') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), 'voice-note.ogg');

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

export async function speakViaAI(text) {
  const res = await fetch(`${AI_SERVICE_URL}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI service /speak failed: ${res.status} ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}