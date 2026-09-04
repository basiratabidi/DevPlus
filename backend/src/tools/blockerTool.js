import { query } from '../db/pool.js';
import { evaluateEscalation } from './escalationRuleTool.js';

const VALID_SEVERITIES = ['low', 'medium', 'high'];

export async function reportBlocker({ userId, description, severity }) {
  severity = severity ?? 'medium';
  if (!VALID_SEVERITIES.includes(severity)) {
    throw new Error(`severity must be one of ${VALID_SEVERITIES.join(', ')}`);
  }
  const result = await query(
    `INSERT INTO blockers (user_id, description, severity)
     VALUES ($1, $2, $3)
     RETURNING id, reported_at`,
    [userId, description, severity]
  );
  return result.rows[0];
}


export async function resolveBlocker({ blockerId }) {
  const result = await query(
    `UPDATE blockers SET status = 'resolved', resolved_at = now()
     WHERE id = $1 RETURNING id, resolved_at`,
    [blockerId]
  );
  return result.rows[0];
}

export async function listOpenBlockers({ userId = null }) {
  const result = userId
    ? await query(`SELECT * FROM blockers WHERE status = 'open' AND user_id = $1 ORDER BY reported_at DESC`, [userId])
    : await query(`SELECT * FROM blockers WHERE status = 'open' ORDER BY reported_at DESC`);
  return result.rows;
}

/**
 * Escalates a blocker immediately if it's high severity.
 * Call this after reportBlocker if you want immediate escalation
 * rather than waiting for the scheduled stale-blocker sweep.
 */
export async function maybeEscalateBlocker({ userId, blockerId, severity }) {
  if (severity !== 'high') return null;
  return evaluateEscalation({
    userId,
    sourceType: 'blocker',
    sourceId: blockerId,
    ruleTriggered: 'high_severity_blocker',
  });
}
