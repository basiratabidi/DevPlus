import { pool } from '../db/pool.js';
import { getHistory } from './historyTool.js';
import { buildHistoryPdf } from '../reports/historyPdf.js';
import { sendWhatsAppDocument } from '../whatsapp/sendDocument.js';

/**
 * Generates a PDF activity report and sends it directly as a WhatsApp
 * document. This tool has a side effect (sends the file) in addition to
 * returning a confirmation - the agent should not claim success unless
 * this actually completes without throwing.
 */
export async function sendHistoryPdf({ userId, days = 7 }) {
  const userResult = await pool.query(
    `SELECT whatsapp_number, name FROM users WHERE id = $1`,
    [userId]
  );
  if (userResult.rowCount === 0) {
    throw new Error(`No user found for userId ${userId}`);
  }
  const { whatsapp_number: phone, name } = userResult.rows[0];

  const history = await getHistory({ userId, days });
  const pdfBuffer = await buildHistoryPdf({ userName: name, days, history });

  const filename = `devpulse-report-${new Date().toISOString().slice(0, 10)}.pdf`;

  await sendWhatsAppDocument({
    to: phone,
    buffer: pdfBuffer,
    filename,
    caption: `Your DevPulse activity report - last ${days} days`,
  });

  return { sent: true, filename, days };
}