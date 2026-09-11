import { query } from '../db/pool.js';
import { evaluateEscalation } from './escalationRuleTool.js';
import { createJiraIssue } from '../services/jira/jiraClient.js';

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
  const blocker = result.rows[0];

  // Immediate escalation for high-severity blockers, mirroring
  // reportIncident's P1 handling - previously defined but never actually
  // called from here, so high-severity blockers silently waited for the
  // 48h stale-blocker sweep instead of escalating right away.
  await maybeEscalateBlocker({ userId, blockerId: blocker.id, severity, description });

  // Best-effort Jira push - see reportIncident for the same pattern and
  // reasoning (never blocks or fails the blocker report itself).
  try {
    const jiraKey = await createJiraIssue({
      summary: `[Blocker, ${severity}] ${description}`,
      description,
      issueType: process.env.JIRA_BLOCKER_ISSUE_TYPE || 'Task',
    });
    if (jiraKey) {
      await query(`UPDATE blockers SET jira_issue_key = $1 WHERE id = $2`, [jiraKey, blocker.id]);
      blocker.jiraIssueKey = jiraKey;
    }
  } catch (err) {
    console.error('Jira issue creation failed for blocker', blocker.id, err);
  }

  return blocker;
}


/**
 * Bumps an existing blocker's reported_at to now, for the case where a
 * user re-reports the same still-open blocker rather than a new one -
 * avoids creating a duplicate row for what's really a timing update.
 */
export async function updateBlockerTiming({ blockerId }) {
  // Reset escalated_at too - the blocker is still ongoing, so it should be
  // eligible to re-escalate after another full threshold period, not stay
  // permanently suppressed by the earlier escalation.
  const result = await query(
    `UPDATE blockers SET reported_at = now(), escalated_at = NULL WHERE id = $1 RETURNING id, reported_at`,
    [blockerId]
  );
  if (result.rowCount === 0) {
    throw new Error(`No blocker found for blockerId ${blockerId}`);
  }
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
export async function maybeEscalateBlocker({ userId, blockerId, severity, description }) {
  if (severity !== 'high') return null;
  return evaluateEscalation({
    userId,
    sourceType: 'blocker',
    sourceId: blockerId,
    ruleTriggered: 'high_severity_blocker',
    summary: `High-severity blocker: "${description}"`,
  });
}
