import express from 'express';
import { getDueReminders, markReminderSent } from '../tools/reminderTool.js';
import { notifyUser } from '../tools/notificationTool.js';
import { runMissedCheckinSweep } from '../tools/missedCheckinTool.js';
import { checkStaleBlockers } from '../tools/escalationRuleTool.js';

export const cronRouter = express.Router();

const REMINDER_TEXT = {
  standup: "Time for your standup update - what are you working on today?",
  deployment_window: "Deployment window is starting soon.",
  blocker_followup: "Following up on your open blocker - any updates?",
};

function requireCronSecret(req, res, next) {
  const secret = req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// Intended to be hit by an n8n Schedule Trigger -> HTTP Request node
// every few minutes, rather than running scripts/runReminders.js directly.
cronRouter.post('/cron/reminders', requireCronSecret, async (req, res) => {
  try {
    const due = await getDueReminders();
    for (const reminder of due) {
      await notifyUser({
        userId: reminder.user_id,
        text: REMINDER_TEXT[reminder.type] ?? 'Reminder from DevPulse.',
      });
      await markReminderSent({ reminderId: reminder.id });
    }
    res.json({ remindersSent: due.length });
  } catch (err) {
    console.error('cron/reminders error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

cronRouter.post('/cron/missed-checkins', requireCronSecret, async (req, res) => {
  try {
    const results = await runMissedCheckinSweep();
    res.json({ missedCheckinsHandled: results.length, results });
  } catch (err) {
    console.error('cron/missed-checkins error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

cronRouter.post('/cron/stale-blockers', requireCronSecret, async (req, res) => {
  try {
    const hoursThreshold = Number(req.body?.hoursThreshold) || 48;
    const escalated = await checkStaleBlockers({ hoursThreshold });
    res.json({ blockersEscalated: escalated.length, escalated });
  } catch (err) {
    console.error('cron/stale-blockers error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});