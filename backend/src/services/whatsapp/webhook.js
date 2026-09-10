import express from 'express';
import crypto from 'crypto';
import { pool } from '../../db/pool.js';
import { runAgent } from '../../agent/graph.js';
import { runOnboarding } from '../../agent/onboarding.js';
import { sendWhatsAppMessage } from './sendMessage.js';
import { downloadMedia } from './mediaDownload.js';
import { transcribeViaAI as transcribeAudio, speakViaAI as textToSpeech } from '../aiservices/aiService.js';
import { sendWhatsAppAudio } from './sendAudio.js';

export const webhookRouter = express.Router();

function stripMarkdownForSpeech(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#{1,6}\s?/g, '')
    .replace(/\n+/g, '. ')
    .trim();
}

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

const processedMessageIds = new Set();
const MAX_TRACKED_IDS = 500;

function isDuplicateMessage(messageId) {
  if (!messageId) return false;
  if (processedMessageIds.has(messageId)) return true;
  processedMessageIds.add(messageId);
  if (processedMessageIds.size > MAX_TRACKED_IDS) {
    const oldest = processedMessageIds.values().next().value;
    processedMessageIds.delete(oldest);
  }
  return false;
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

    if (isDuplicateMessage(message.id)) {
      console.log('Ignoring duplicate webhook delivery for message:', message.id);
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
      `SELECT u.id, p.onboarding_complete
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.whatsapp_number = $1`,
      [from]
    );

    const existingUserId = userResult.rowCount > 0 ? userResult.rows[0].id : null;
    const isOnboarded = userResult.rowCount > 0 && userResult.rows[0].onboarding_complete === true;

    if (!isOnboarded) {
      const { reply: onboardingReply } = await runOnboarding({
        phoneNumber: from,
        message: messageText,
        existingUserId,
      });
      await sendWhatsAppMessage({ to: from, text: onboardingReply });
      return res.sendStatus(200);
    }

    const userId = existingUserId;
    const reply = await runAgent({ userId, message: messageText });

    if (wasVoiceNote) {
      try {
        const audioBuffer = await textToSpeech(stripMarkdownForSpeech(reply));
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