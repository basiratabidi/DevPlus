import { query } from '../db/pool.js';

/**
 * Projects are a shared, team-wide list (not per-user) - so any user can
 * report against the same project another user (or a connected external
 * system, via errorIngestTool.js) already reported against. Lets
 * duplicate-detection and reporting be scoped per-project, not just
 * per-user.
 */

export async function listProjects() {
  const result = await query(`SELECT id, name FROM projects ORDER BY name`);
  return result.rows;
}

/**
 * Resolves a project name to its row, creating it if it doesn't exist
 * yet - a project is "created" simply by being the first thing reported
 * against it, no separate setup step needed.
 */
export async function getOrCreateProject({ name }) {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing = await query(`SELECT id, name FROM projects WHERE name = $1`, [trimmed]);
  if (existing.rowCount > 0) return existing.rows[0];

  const created = await query(
    `INSERT INTO projects (name) VALUES ($1) RETURNING id, name`,
    [trimmed]
  );
  return created.rows[0];
}
