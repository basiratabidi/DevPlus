import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// graph.js reads its DB-backed tool modules at import time (pg Pool is
// lazy - see pool.js), so these dummy values only need to be present,
// never actually connected to, for the module to load in a test process.
process.env.DATABASE_URL ??= 'postgresql://ci:ci@localhost:5432/ci';
process.env.GROQ_API_KEY ??= 'ci-dummy-key';

const { describeToolResult } = await import('../src/agent/graph.js');

describe('describeToolResult', () => {
  test('returns null when the tool result carries an error', () => {
    assert.equal(describeToolResult('logTask', {}, { error: 'boom' }), null);
  });

  test('returns null for a null/undefined result', () => {
    assert.equal(describeToolResult('logTask', {}, null), null);
    assert.equal(describeToolResult('logTask', {}, undefined), null);
  });

  test('logTask confirmation includes the summary', () => {
    const msg = describeToolResult('logTask', { summary: 'fixed the login bug' }, { id: 1 });
    assert.equal(msg, 'Logged task update: "fixed the login bug"');
  });

  test('reportIncident confirmation includes severity, id, and title', () => {
    const msg = describeToolResult(
      'reportIncident',
      { severity: 'P1', title: 'CDN serving stale assets' },
      { id: 14 }
    );
    assert.equal(msg, 'Logged P1 incident #14: "CDN serving stale assets"');
  });

  test('reportIncident confirmation appends the Jira issue key when present', () => {
    const msg = describeToolResult(
      'reportIncident',
      { severity: 'P1', title: 'CDN serving stale assets' },
      { id: 14, jiraIssueKey: 'SCRUM-9' }
    );
    assert.equal(msg, 'Logged P1 incident #14: "CDN serving stale assets" (Jira: SCRUM-9)');
  });

  test('reportIncident confirmation omits the Jira clause when jiraIssueKey is absent', () => {
    const msg = describeToolResult(
      'reportIncident',
      { severity: 'P2', title: 'slow build times' },
      { id: 15 }
    );
    assert.ok(!msg.includes('Jira'));
  });

  test('updateIncidentTiming confirms an update, not a new record', () => {
    const msg = describeToolResult('updateIncidentTiming', {}, { id: 14 });
    assert.equal(msg, 'Updated timing on existing incident #14 (not logged as new)');
  });

  test('reportBlocker confirmation appends the Jira issue key when present', () => {
    const msg = describeToolResult(
      'reportBlocker',
      { description: 'waiting on API keys' },
      { id: 8, jiraIssueKey: 'SCRUM-11' }
    );
    assert.equal(msg, 'Logged blocker #8: "waiting on API keys" (Jira: SCRUM-11)');
  });

  test('updateBlockerTiming confirms an update, not a new record', () => {
    const msg = describeToolResult('updateBlockerTiming', {}, { id: 8 });
    assert.equal(msg, 'Updated timing on existing blocker #8 (not logged as new)');
  });

  test('logDeployment confirmation includes environment, id, and service name', () => {
    const msg = describeToolResult(
      'logDeployment',
      { environment: 'production', serviceName: 'api-gateway' },
      { id: 22 }
    );
    assert.equal(msg, 'Logged production deployment #22 for api-gateway');
  });

  test('sendHistoryPdf confirms only when actually sent', () => {
    assert.equal(
      describeToolResult('sendHistoryPdf', {}, { sent: true, days: 7 }),
      'Sent your activity report (last 7 days) as a PDF'
    );
    assert.equal(describeToolResult('sendHistoryPdf', {}, { sent: false, days: 7 }), null);
  });

  test('sendBlockersPdf confirms only when actually sent', () => {
    assert.equal(
      describeToolResult('sendBlockersPdf', {}, { sent: true, count: 3 }),
      'Sent your open blockers (3) as a PDF'
    );
    assert.equal(describeToolResult('sendBlockersPdf', {}, { sent: false, count: 0 }), null);
  });

  test('an unrecognized tool name returns null rather than throwing', () => {
    assert.equal(describeToolResult('someFutureTool', {}, { id: 1 }), null);
  });
});
