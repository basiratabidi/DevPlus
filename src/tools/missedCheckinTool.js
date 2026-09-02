import { findMissedCheckins } from './reminderTool.js';
import { notifyUser } from './notificationTool.js';
import { evaluateEscalation } from './escalationRuleTool.js';

/**
 * Agent/scheduler-facing wrapper: finds users who haven't logged a
 * standup today, nudges them directly, and escalates if notifyOnP1-style
 * flag is off (i.e. team lead wants to know about silent members).
 * Intended to be called by an n8n cron workflow once per day, shortly
 * after each user's standup_time window closes.
 */
export async function runMissedCheckinSweep() {
  const missed = findMissedCheckins ? await findMissedCheckins() : [];
  const results = [];

  for (const person of missed) {
    await notifyUser({
      userId: person.user_id,
      text: "Haven't seen your standup update yet today - drop a quick summary of what you're working on.",
    });

    const escalation = await evaluateEscalation({
      userId: person.user_id,
      sourceType: 'missed_checkin',
      sourceId: null,
      ruleTriggered: 'missed_standup',
    });

    results.push({ userId: person.user_id, ...escalation });
  }

  return results;
}
