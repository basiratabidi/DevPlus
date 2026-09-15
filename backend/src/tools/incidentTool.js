import { query } from '../db/pool.js';
import { evaluateEscalation } from './escalationRuleTool.js';
import { createJiraIssue } from '../services/jira/jiraClient.js';
import { getOrCreateProject } from './projectTool.js';

const VALID_SEVERITIES = ['P1', 'P2', 'P3', 'P4'];

/**
 * Records an incident report and checks whether it should trigger escalation.
 * Mirrors the "HealthRecords" core-urgent-entity tool in GlucoWhats.
 */
export async function reportIncident({ userId, title, description, severity, affectedSystem, projectName }) {
  if (!VALID_SEVERITIES.includes(severity)) {
    throw new Error(`severity must be one of ${VALID_SEVERITIES.join(', ')}`);
  }
  const project = await getOrCreateProject({ name: projectName });
  const result = await query(
    `INSERT INTO incidents (user_id, title, description, severity, affected_system, project_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, reported_at`,
    [userId, title, description, severity, affectedSystem, project?.id ?? null]
  );
  const incident = result.rows[0];

  // Severity-based escalation, e.g. any P1 escalates immediately
  if (severity === 'P1') {
    await evaluateEscalation({
      userId,
      sourceType: 'incident',
      sourceId: incident.id,
      ruleTriggered: 'P1_incident',
      summary: `P1 incident: "${title}"`,
    });
  }

  // Best-effort Jira push - DevPulse stays the source of truth even if
  // Jira is unconfigured or the API call fails, so this never blocks or
  // fails the incident report itself.
  try {
    const jiraKey = await createJiraIssue({
      summary: `[${severity}] ${title}`,
      description: [description, affectedSystem ? `Affected system: ${affectedSystem}` : null]
        .filter(Boolean)
        .join('\n'),
      issueType: process.env.JIRA_INCIDENT_ISSUE_TYPE || 'Bug',
    });
    if (jiraKey) {
      await query(`UPDATE incidents SET jira_issue_key = $1 WHERE id = $2`, [jiraKey, incident.id]);
      incident.jiraIssueKey = jiraKey;
    }
  } catch (err) {
    console.error('Jira issue creation failed for incident', incident.id, err);
  }

  return incident;
}

/**
 * Bumps an existing incident's reported_at to now, for the case where a
 * user re-reports the same still-open incident rather than a new one -
 * avoids creating a duplicate row for what's really a timing update.
 */
export async function updateIncidentTiming({ incidentId }) {
  const result = await query(
    `UPDATE incidents SET reported_at = now() WHERE id = $1 RETURNING id, reported_at`,
    [incidentId]
  );
  if (result.rowCount === 0) {
    throw new Error(`No incident found for incidentId ${incidentId}`);
  }
  return result.rows[0];
}

export async function resolveIncident({ incidentId }) {
  const result = await query(
    `UPDATE incidents SET status = 'resolved', resolved_at = now()
     WHERE id = $1 RETURNING id, resolved_at`,
    [incidentId]
  );
  return result.rows[0];
}

/**
 * @param {{ userId?: number|null, projectName?: string|null }} args
 * Scoped by project when a projectName is given (and matches a known
 * project), on top of the existing per-user scoping - two different
 * users (or the same user) reporting similar-sounding incidents for
 * DIFFERENT projects should never be treated as the same open incident.
 */
export async function listOpenIncidents({ userId = null, projectName = null }) {
  const conditions = [`status != 'resolved'`];
  const params = [];
  if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (projectName) {
    params.push(projectName);
    conditions.push(`project_id = (SELECT id FROM projects WHERE name = $${params.length})`);
  }
  const result = await query(
    `SELECT i.*, p.name AS project_name FROM incidents i
     LEFT JOIN projects p ON p.id = i.project_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY reported_at DESC`,
    params
  );
  return result.rows;
}
