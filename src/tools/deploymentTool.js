import { query } from '../db/pool.js';

const VALID_ENVIRONMENTS = ['staging', 'production'];
const VALID_STATUSES = ['scheduled', 'success', 'failed', 'rolled_back'];

export async function logDeployment({ userId, serviceName, environment, status, scheduledFor = null, notes = null }) {
  status = status ?? 'scheduled';
  notes = notes ?? null;

  if (!VALID_ENVIRONMENTS.includes(environment)) {
    throw new Error(`environment must be one of ${VALID_ENVIRONMENTS.join(', ')}`);
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`status must be one of ${VALID_STATUSES.join(', ')}`);
  }
  const result = await query(
    `INSERT INTO deployments (user_id, service_name, environment, status, scheduled_for, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, scheduled_for`,
    [userId, serviceName, environment, status, scheduledFor, notes]
  );
  return result.rows[0];
}

export async function updateDeploymentStatus({ deploymentId, status, notes = null }) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`status must be one of ${VALID_STATUSES.join(', ')}`);
  }
  const completedAt = status === 'success' || status === 'failed' || status === 'rolled_back' ? new Date() : null;
  const result = await query(
    `UPDATE deployments
     SET status = $1, notes = COALESCE($2, notes), completed_at = COALESCE($3, completed_at)
     WHERE id = $4
     RETURNING id, status, completed_at`,
    [status, notes, completedAt, deploymentId]
  );
  return result.rows[0];
}

export async function listUpcomingDeployments({ userId = null }) {
  const result = userId
    ? await query(
        `SELECT * FROM deployments WHERE status = 'scheduled' AND user_id = $1 ORDER BY scheduled_for ASC`,
        [userId]
      )
    : await query(`SELECT * FROM deployments WHERE status = 'scheduled' ORDER BY scheduled_for ASC`);
  return result.rows;
}