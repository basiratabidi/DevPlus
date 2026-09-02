import { query } from '../db/pool.js';

export async function createUser({ whatsappNumber, name }) {
  const result = await query(
    `INSERT INTO users (whatsapp_number, name)
     VALUES ($1, $2)
     ON CONFLICT (whatsapp_number) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, whatsapp_number, name`,
    [whatsappNumber, name]
  );
  return result.rows[0];
}

export async function upsertProfile({ userId, role, team, standupTime = '10:00', notifyOnP1 = true }) {
  const existing = await query(`SELECT id FROM profiles WHERE user_id = $1`, [userId]);

  if (existing.rowCount > 0) {
    const result = await query(
      `UPDATE profiles
       SET role = $2, team = $3, standup_time = $4, notify_on_p1 = $5
       WHERE user_id = $1
       RETURNING id`,
      [userId, role, team, standupTime, notifyOnP1]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO profiles (user_id, role, team, standup_time, notify_on_p1)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, role, team, standupTime, notifyOnP1]
  );
  return result.rows[0];
}

export async function addEscalationContact({ userId, contactName, contactNumber, relation = 'team_lead' }) {
  const result = await query(
    `INSERT INTO escalation_contacts (user_id, contact_name, contact_number, relation)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, contactName, contactNumber, relation]
  );
  return result.rows[0];
}

export async function getProfile({ userId }) {
  const result = await query(
    `SELECT u.id, u.whatsapp_number, u.name, p.role, p.team, p.standup_time, p.notify_on_p1
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}