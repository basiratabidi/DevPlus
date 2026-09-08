import { query } from '../db/pool.js';

/**
 * Unified read-across-entities tool, mirroring GlucoWhats' History Retrieval Tool.
 * Lets the agent answer "what happened this week" style questions.
 */
export async function getHistory({ userId, days = 7 }) {
  const [tasks, incidents, blockers, deployments] = await Promise.all([
    query(
      `SELECT id, summary, logged_at FROM task_logs
       WHERE user_id = $1 AND logged_at >= now() - ($2 || ' days')::interval
       ORDER BY logged_at DESC`,
      [userId, days]
    ),
    query(
      `SELECT id, title, severity, status, reported_at FROM incidents
       WHERE user_id = $1 AND reported_at >= now() - ($2 || ' days')::interval
       ORDER BY reported_at DESC`,
      [userId, days]
    ),
    query(
      `SELECT id, description, severity, status, reported_at FROM blockers
       WHERE user_id = $1 AND reported_at >= now() - ($2 || ' days')::interval
       ORDER BY reported_at DESC`,
      [userId, days]
    ),
    query(
      `SELECT id, service_name, environment, status, completed_at FROM deployments
       WHERE user_id = $1 AND scheduled_for >= now() - ($2 || ' days')::interval
       ORDER BY scheduled_for DESC`,
      [userId, days]
    ),
  ]);

  return {
    taskLogs: tasks.rows,
    incidents: incidents.rows,
    blockers: blockers.rows,
    deployments: deployments.rows,
  };
}
