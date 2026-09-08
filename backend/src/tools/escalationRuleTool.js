import { query } from '../db/pool.js';
import { sendWhatsAppMessage } from '../services/whatsapp/sendMessage.js';

/**
 * Evaluates and fires an escalation: writes an EscalationEvent and
 * notifies the user's escalation contact (team lead / on-call).
 * Mirrors the "SafetyEvents" tool in GlucoWhats.
 */
export async function evaluateEscalation({ userId, sourceType, sourceId, ruleTriggered }) {
  const contactResult = await query(
    `SELECT id, contact_name, contact_number FROM escalation_contacts
     WHERE user_id = $1 LIMIT 1`,
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

  await sendWhatsAppMessage({
    to: contact.contact_number,
    text: `Escalation triggered (${ruleTriggered}) for user ${userId}. Source: ${sourceType} #${sourceId}.`,
  });

  return { escalationEventId: eventResult.rows[0].id, notified: true };
}

/**
 * Checks blockers that have been open past a threshold and escalates them.
 * Intended to be called on a schedule (n8n cron), not directly by the agent.
 */
export async function checkStaleBlockers({ hoursThreshold = 48 } = {}) {
  const result = await query(
    `SELECT id, user_id FROM blockers
     WHERE status = 'open' AND reported_at < now() - ($1 || ' hours')::interval`,
    [hoursThreshold]
  );

  const escalated = [];
  for (const blocker of result.rows) {
    const outcome = await evaluateEscalation({
      userId: blocker.user_id,
      sourceType: 'blocker',
      sourceId: blocker.id,
      ruleTriggered: `blocker_open_${hoursThreshold}h`,
    });
    escalated.push({ blockerId: blocker.id, ...outcome });
  }
  return escalated;
}
