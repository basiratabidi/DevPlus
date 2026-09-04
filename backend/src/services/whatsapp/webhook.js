import express from 'express';
import crypto from 'crypto';
import { pool } from '../../db/pool.js';
import { runAgent } from '../../agent/graph.js';
import { sendWhatsAppMessage } from './sendMessage.js';
import { downloadMedia } from './mediaDownload.js';
import { transcribeAudio } from '../../agent/transcribe.js';
import { textToSpeech } from '../../agent/textToSpeech.js';
import { sendWhatsAppAudio } from './sendAudio.js';
import { transcribeViaAI as transcribeAudio, speakViaAI as textToSpeech } from '../services/aiService.js';


export const webhookRouter = express.Router();

webhookRouter.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function isValidSignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !req.rawBody) return false;

  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
      .update(req.rawBody)
      .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

webhookRouter.post('/webhook/whatsapp', async (req, res) => {
  try {
    if (!isValidSignature(req)) {
      console.warn('Rejected webhook: invalid signature');
      return res.sendStatus(401);
    }

    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    if (!from) {
      return res.sendStatus(200);
    }

    let messageText = null;
    const wasVoiceNote = message.type === 'audio';

    if (message.type === 'text') {
      messageText = message.text?.body;
    } else if (wasVoiceNote) {
      const mediaId = message.audio?.id;
      if (!mediaId) {
        return res.sendStatus(200);
      }
      try {
        const { buffer, mimeType } = await downloadMedia(mediaId);
        messageText = await transcribeAudio(buffer, mimeType);
        console.log('Transcribed voice note:', messageText);
      } catch (err) {
        console.error('Voice note transcription failed:', err);
        await sendWhatsAppMessage({
          to: from,
          text: "I couldn't process that voice note - could you try again or send it as text?",
        });
        return res.sendStatus(200);
      }
    } else {
      return res.sendStatus(200);
    }

    if (!messageText) {
      return res.sendStatus(200);
    }

    const userResult = await pool.query(
      `SELECT id FROM users WHERE whatsapp_number = $1`,
      [from]
    );

    if (userResult.rowCount === 0) {
      await sendWhatsAppMessage({
        to: from,
        text: "You're not registered yet. Contact your team lead to be onboarded to DevPulse.",
      });
      return res.sendStatus(200);
    }

    const userId = userResult.rows[0].id;
    const reply = await runAgent({ userId, message: messageText });

    // Reply in the same modality the user used: voice note in -> voice note out
    if (wasVoiceNote) {
      try {
        const audioBuffer = await textToSpeech(reply);
        await sendWhatsAppAudio({ to: from, buffer: audioBuffer });
      } catch (err) {
        console.error('Voice reply failed, falling back to text:', err);
        await sendWhatsAppMessage({ to: from, text: reply });
      }
    } else {
      await sendWhatsAppMessage({ to: from, text: reply });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('webhook error', err);
    res.sendStatus(500);
  }
});
