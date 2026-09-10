import { pool } from '../db/pool.js';
import { listOpenBlockers } from './blockerTool.js';
import { buildBlockersPdf } from '../reports/blockersPdf.js';
import { sendWhatsAppDocument } from '../services/whatsapp/sendDocument.js';

/**
 * Generates a PDF of the user's open blockers and sends it directly as
 * a WhatsApp document. This tool has a side effect (sends the file) in
 * addition to returning a confirmation - the agent should not claim
 * success unless this actually completes without throwing.
 */
export async function sendBlockersPdf({ userId }) {
  const userResult = await pool.query(
    `SELECT whatsapp_number, name FROM users WHERE id = $1`,
    [userId]
  );
  if (userResult.rowCount === 0) {
    throw new Error(`No user found for userId ${userId}`);
  }
  const { whatsapp_number: phone, name } = userResult.rows[0];

  const blockers = await listOpenBlockers({ userId });
  const pdfBuffer = await buildBlockersPdf({ userName: name, blockers });

  const filename = `devpulse-blockers-${new Date().toISOString().slice(0, 10)}.pdf`;

  await sendWhatsAppDocument({
    to: phone,
    buffer: pdfBuffer,
    filename,
    caption: 'Your open blockers',
  });

  return { sent: true, filename, count: blockers.length };
}
