import { pool } from '../db/pool.js';
import { sendWhatsAppMessage } from '../whatsapp/sendMessage.js';

export async function notifyUser({ userId, text }) {
  const result = await pool.query(`SELECT whatsapp_number FROM users WHERE id = $1`, [userId]);
  if (result.rowCount === 0) {
    throw new Error(`No user found for userId ${userId}`);
  }
  return sendWhatsAppMessage({ to: result.rows[0].whatsapp_number, text });
}

export async function notifyNumber({ number, text }) {
  return sendWhatsAppMessage({ to: number, text });
}