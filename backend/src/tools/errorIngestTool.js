import { createUser, upsertProfile, addEscalationContact } from './profileTool.js';
import { reportIncident, listOpenIncidents, updateIncidentTiming } from './incidentTool.js';
import { reportBlocker, listOpenBlockers, updateBlockerTiming } from './blockerTool.js';
import { indexErrorLog, indexProjectErrorLog } from '../services/opensearch/client.js';
import { ensureConnectedProjectDashboard } from '../services/opensearch/dashboardProvisioner.js';
import { query } from '../db/pool.js';

/**
 * Automatic error intake from a *connected external project* (not
 * DevPulse's own backend/ai-services code) - per advisor feedback,
 * activity/incident logging shouldn't require a person to type it into
 * WhatsApp. A connected project's own CI/error-handler POSTs here (see
 * routes/logs.js: POST /logs/ingest-error), and this reuses
 * reportIncident/reportBlocker directly rather than reimplementing
 * escalation/Jira logic - an auto-detected P1 gets the exact same
 * escalation + Jira behavior a human-reported P1 gets.
 */

const SYSTEM_USER_WHATSAPP = 'system-monitoring';
let systemUserIdCache = null;

async function getOrCreateSystemUser() {
  if (systemUserIdCache) return systemUserIdCache;

  const user = await createUser({ whatsappNumber: SYSTEM_USER_WHATSAPP, name: 'Connected Projects Monitor' });
  await upsertProfile({ userId: user.id, role: 'automated-monitor', team: 'external-projects', notifyOnP1: true });

  const escalationNumber = process.env.ERROR_ESCALATION_CONTACT_NUMBER;
  if (escalationNumber) {
    const existing = await query('SELECT id FROM escalation_contacts WHERE user_id = $1', [user.id]);
    if (existing.rowCount === 0) {
      await addEscalationContact({
        userId: user.id,
        contactName: 'On-call (auto-detected errors)',
        contactNumber: escalationNumber,
        relation: 'on_call',
      });
    }
  }

  systemUserIdCache = user.id;
  return user.id;
}

function mapToIncidentSeverity(level) {
  const l = (level || '').toLowerCase();
  if (['critical', 'fatal', 'p1'].includes(l)) return 'P1';
  if (['error', 'p2'].includes(l)) return 'P2';
  if (['warn', 'warning', 'p3'].includes(l)) return 'P3';
  return 'P4';
}

function mapToBlockerSeverity(level) {
  const l = (level || '').toLowerCase();
  if (['critical', 'fatal', 'error'].includes(l)) return 'high';
  if (['warn', 'warning'].includes(l)) return 'medium';
  return 'low';
}

const INCIDENT_WORTHY_LEVELS = new Set(['critical', 'fatal', 'error', 'p1', 'p2']);

/**
 * @param {{ project: string, level: string, message: string, stack?: string, source?: string }} err
 */
export async function ingestProjectError({ project, level, message, stack, source }) {
  // Audit trail first, always - independent of whatever happens below.
  try {
    await indexErrorLog({ project, level, message, stack, source });
  } catch (err) {
    console.error('Failed to index error log (non-blocking):', err);
  }

  // Per-project index + dashboard, auto-provisioned on this project's
  // first-ever reported error/CI failure - see dashboardProvisioner.js.
  // Best-effort: OSD being unreachable must never block error intake.
  try {
    await indexProjectErrorLog(project, { project, level, message, stack, source });
    await ensureConnectedProjectDashboard(project);
  } catch (err) {
    console.error('Failed to provision per-project dashboard (non-blocking):', err);
  }

  const userId = await getOrCreateSystemUser();
  const title = `[${project}] ${message}`.slice(0, 200);

  // Dedup: a repeated identical error from the same project shouldn't
  // create a new record every time it fires - refresh timing on the
  // existing open one instead, same reasoning as the agent's own
  // duplicate-incident confirmation flow (just without asking, since
  // there's no human in this loop to ask).
  const openIncidents = await listOpenIncidents({ userId });
  const existingIncident = openIncidents.find((i) => i.title === title);
  if (existingIncident) {
    const result = await updateIncidentTiming({ incidentId: existingIncident.id });
    return { action: 'updated_incident', incidentId: existingIncident.id, ...result };
  }

  const openBlockers = await listOpenBlockers({ userId });
  const existingBlocker = openBlockers.find((b) => b.description === title);
  if (existingBlocker) {
    const result = await updateBlockerTiming({ blockerId: existingBlocker.id });
    return { action: 'updated_blocker', blockerId: existingBlocker.id, ...result };
  }

  if (INCIDENT_WORTHY_LEVELS.has((level || '').toLowerCase())) {
    const severity = mapToIncidentSeverity(level);
    const incident = await reportIncident({
      userId,
      title,
      description: stack || message,
      severity,
      affectedSystem: project,
    });
    return { action: 'created_incident', severity, ...incident };
  }

  const severity = mapToBlockerSeverity(level);
  const blocker = await reportBlocker({ userId, description: title, severity });
  return { action: 'created_blocker', severity, ...blocker };
}
