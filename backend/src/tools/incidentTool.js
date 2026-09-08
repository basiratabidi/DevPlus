import { query } from '../db/pool.js';
import { evaluateEscalation } from './escalationRuleTool.js';

const VALID_SEVERITIES = ['P1', 'P2', 'P3', 'P4'];

/**
 * Records an incident report and checks whether it should trigger escalation.
 * Mirrors the "HealthRecords" core-urgent-entity tool in GlucoWhats.
 */
export async function reportIncident({ userId, title, description, severity, affectedSystem }) {
  if (!VALID_SEVERITIES.includes(severity)) {
    throw new Error(`severity must be one of ${VALID_SEVERITIES.join(', ')}`);
  }
  const result = await query(
    `INSERT INTO incidents (user_id, title, description, severity, affected_system)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, reported_at`,
    [userId, title, description, severity, affectedSystem]
  );
  const incident = result.rows[0];

  // Severity-based escalation, e.g. any P1 escalates immediately
  if (severity === 'P1') {
    await evaluateEscalation({
      userId,
      sourceType: 'incident',
      sourceId: incident.id,
      ruleTriggered: 'P1_incident',
    });
  }

  return incident;
}

export async function resolveIncident({ incidentId }) {
  const result = await query(
    `UPDATE incidents SET status = 'resolved', resolved_at = now()
     WHERE id = $1 RETURNING id, resolved_at`,
    [incidentId]
  );
  return result.rows[0];
}

export async function listOpenIncidents({ userId = null }) {
  const result = userId
    ? await query(`SELECT * FROM incidents WHERE status != 'resolved' AND user_id = $1 ORDER BY reported_at DESC`, [userId])
    : await query(`SELECT * FROM incidents WHERE status != 'resolved' ORDER BY reported_at DESC`);
  return result.rows;
}
