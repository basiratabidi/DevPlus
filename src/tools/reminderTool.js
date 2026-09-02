import { query } from '../db/pool.js';

const VALID_TYPES = ['standup', 'deployment_window', 'blocker_followup'];

export async function scheduleReminder({ userId, type, scheduledAt }) {
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`type must be one of ${VALID_TYPES.join(', ')}`);
  }
  const result = await query(
    `INSERT INTO reminders (user_id, type, scheduled_at)
     VALUES ($1, $2, $3) RETURNING id, scheduled_at`,
    [userId, type, scheduledAt]
  );
  return result.rows[0];
}

/**
 * Fetches reminders due to be sent. Intended to be polled by an n8n
 * cron workflow every few minutes, not called directly by the agent.
 */
export async function getDueReminders() {
  const result = await query(
    `SELECT r.id, r.user_id, r.type, u.whatsapp_number
     FROM reminders r
     JOIN users u ON u.id = r.user_id
     WHERE r.sent = FALSE AND r.scheduled_at <= now()`
  );
  return result.rows;
}

export async function markReminderSent({ reminderId }) {
  await query(`UPDATE reminders SET sent = TRUE WHERE id = $1`, [reminderId]);
}

/**
 * Missed check-in detection: users with a standup_time in their profile
 * who have not logged a task_log or been sent a reminder yet today.
 * Mirrors GlucoWhats' pattern for detecting missed logging.
 */
export async function findMissedCheckins() {
  const result = await query(
    `SELECT p.user_id, u.whatsapp_number, p.standup_time
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.standup_time < CURRENT_TIME
       AND NOT EXISTS (
         SELECT 1 FROM task_logs t
         WHERE t.user_id = p.user_id AND t.logged_at::date = CURRENT_DATE
       )`
  );
  return result.rows;
}
