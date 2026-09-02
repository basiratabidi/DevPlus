import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { correctTranscript } from './correctTranscript.js';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function transcribeAudio(buffer, mimeType = 'audio/ogg') {
  const file = new File([buffer], 'voice-note.ogg', { type: mimeType });

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    language: 'ur',
    prompt: 'Engineering team standup update. Severity levels: P1, P2, P3, P4. Terms: deployment, staging, production, incident, blocker, rollback, API, database.',
  });

  return correctTranscript(transcription.text);
}
