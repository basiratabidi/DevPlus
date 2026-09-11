import { query } from '../db/pool.js';
import { sendWhatsAppMessage } from '../services/whatsapp/sendMessage.js';

/**
 * Evaluates and fires an escalation: writes an EscalationEvent and
 * notifies the user's escalation contact (team lead / on-call).
 * Mirrors the "SafetyEvents" tool in GlucoWhats.
 */
export async function evaluateEscalation({ userId, sourceType, sourceId, ruleTriggered, summary, relation = 'reported by' }) {
  const contactResult = await query(
    `SELECT ec.id, ec.contact_name, ec.contact_number, u.name AS reporter_name
     FROM escalation_contacts ec
     JOIN users u ON u.id = ec.user_id
     WHERE ec.user_id = $1 LIMIT 1`,
    [userId]
  );

  if (contactResult.rowCount === 0) {
    // No escalation contact configured - still log the event, contact stays null
    const result = await query(
      `INSERT INTO escalation_events (user_id, source_type, source_id, rule_triggered)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, sourceType, sourceId, ruleTriggered]
    );
    return { escalationEventId: result.rows[0].id, notified: false };
  }

  const contact = contactResult.rows[0];

  const eventResult = await query(
    `INSERT INTO escalation_events (user_id, source_type, source_id, rule_triggered, notified_contact)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, sourceType, sourceId, ruleTriggered, contact.id]
  );

  // Human-readable text for a real person receiving this on WhatsApp -
  // internal ids (userId/sourceId/ruleTriggered) stay in escalation_events
  // for audit, but were previously leaking raw into the message itself
  // (found via live testing: "Escalation triggered (P1_incident) for user
  // 11. Source: incident #17." landing with zero context in the contact's
  // own WhatsApp thread).
  const text = summary
    ? `🚨 Escalation: ${summary}, ${relation} ${contact.reporter_name}.`
    : `🚨 Escalation triggered for ${contact.reporter_name} (${sourceType}${sourceId != null ? ` #${sourceId}` : ''}).`;

  await sendWhatsAppMessage({ to: contact.contact_number, text });

  return { escalationEventId: eventResult.rows[0].id, notified: true };
}

/**
 * Checks blockers that have been open past a threshold and escalates them.
 * Intended to be called on a schedule (n8n cron), not directly by the agent.
 */
export async function checkStaleBlockers({ hoursThreshold = 48 } = {}) {
  const result = await query(
    `SELECT id, user_id, description FROM blockers
     WHERE status = 'open' AND escalated_at IS NULL
       AND reported_at < now() - ($1 || ' hours')::interval`,
    [hoursThreshold]
  );

  const escalated = [];
  for (const blocker of result.rows) {
    const outcome = await evaluateEscalation({
      userId: blocker.user_id,
      sourceType: 'blocker',
      sourceId: blocker.id,
      ruleTriggered: `blocker_open_${hoursThreshold}h`,
      summary: `Blocker open ${hoursThreshold}h+: "${blocker.description}"`,
    });
    await query(`UPDATE blockers SET escalated_at = now() WHERE id = $1`, [blocker.id]);
    escalated.push({ blockerId: blocker.id, ...outcome });
  }
  return escalated;
}
