import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Transcribes an audio buffer using Groq's Whisper endpoint.
 * WhatsApp voice notes arrive as OGG/Opus - Whisper accepts this directly.
 *
 * NOTE: uploading via the File/Blob constructor - this is the standard
 * shape for groq-sdk's audio.transcriptions.create. If your installed
 * version errors on this, check `npm list groq-sdk` and the SDK's own
 * README for the exact upload parameter shape for that version.
 */
export async function transcribeAudio(buffer, mimeType = 'audio/ogg') {
  const file = new File([buffer], 'voice-note.ogg', { type: mimeType });

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
  });

  return transcription.text;
}

