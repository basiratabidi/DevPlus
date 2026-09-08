// Throwaway script: exercises the tool layer directly, no LLM, no WhatsApp.
// Run with: node src/scripts/testTools.js

import { createUser, upsertProfile, addEscalationContact } from '../tools/profileTool.js';
import { logTask, getRecentTaskLogs } from '../tools/taskLogTool.js';
import { reportIncident, listOpenIncidents } from '../tools/incidentTool.js';
import { reportBlocker, listOpenBlockers } from '../tools/blockerTool.js';
import { logDeployment, listUpcomingDeployments } from '../tools/deploymentTool.js';
import { getHistory } from '../tools/historyTool.js';
import { pool } from '../db/pool.js';

async function main() {
  const user = await createUser({ whatsappNumber: '923001234567', name: 'Test Engineer' });
  console.log('user:', user);

  await upsertProfile({ userId: user.id, role: 'developer', team: 'backend' });
  await addEscalationContact({ userId: user.id, contactName: 'Team Lead', contactNumber: '923009999999' });

  const task = await logTask({ userId: user.id, summary: 'Fixed pagination bug in orders API', taskRef: 'JIRA-142' });
  console.log('task logged:', task);

  const incident = await reportIncident({
    userId: user.id,
    title: 'Payment webhook failing',
    description: 'Stripe webhook returning 500s since deploy',
    severity: 'P2',
    affectedSystem: 'payments-service',
  });
  console.log('incident reported:', incident);

  const blocker = await reportBlocker({ userId: user.id, description: 'Waiting on staging DB credentials', severity: 'medium' });
  console.log('blocker reported:', blocker);

  const deployment = await logDeployment({
    userId: user.id,
    serviceName: 'orders-api',
    environment: 'staging',
    scheduledFor: new Date(),
  });
  console.log('deployment logged:', deployment);

  console.log('recent tasks:', await getRecentTaskLogs({ userId: user.id }));
  console.log('open incidents:', await listOpenIncidents({ userId: user.id }));
  console.log('open blockers:', await listOpenBlockers({ userId: user.id }));
  console.log('upcoming deployments:', await listUpcomingDeployments({ userId: user.id }));
  console.log('full history:', await getHistory({ userId: user.id }));

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});