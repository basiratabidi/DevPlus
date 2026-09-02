import { query } from '../db/pool.js';

/**
 * Records a status update / work summary for a user.
 * Mirrors the "Meals" logging tool in GlucoWhats.
 */
export async function logTask({ userId, summary, taskRef = null }) {
  if (!userId || !summary) {
    throw new Error('logTask requires userId and summary');
  }
  const result = await query(
    `INSERT INTO task_logs (user_id, summary, task_ref)
     VALUES ($1, $2, $3)
     RETURNING id, logged_at`,
    [userId, summary, taskRef]
  );
  return result.rows[0];
}

export async function getRecentTaskLogs({ userId, days = 7 }) {
  const result = await query(
    `SELECT id, summary, task_ref, logged_at
     FROM task_logs
     WHERE user_id = $1 AND logged_at >= now() - ($2 || ' days')::interval
     ORDER BY logged_at DESC`,
    [userId, days]
  );
  return result.rows;
}
