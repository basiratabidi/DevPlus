// A tiny "real app" that stands in for a connected team's project.
// It has a couple of routes that fail on purpose so you can see a real
// error travel: this app -> DevPulse /logs/ingest-error -> incident/
// blocker + escalation + Jira, exactly as docs/CONNECTING_A_PROJECT.md
// describes.

import express from 'express';
import { reportErrorToDevPulse } from './devpulse.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4100;

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: process.env.DEVPULSE_PROJECT_NAME || 'demo-external-project',
    routes: ['/work (ok)', '/fail/critical', '/fail/error', '/fail/warning'],
  });
});

app.get('/work', (req, res) => {
  res.json({ ok: true, message: 'nothing went wrong' });
});

// Simulates a hard runtime failure (DB down, unhandled exception, etc.)
// -> reported as level "critical" -> becomes a P1 incident in DevPulse.
app.get('/fail/critical', async (req, res) => {
  try {
    throw new Error('DB connection refused');
  } catch (err) {
    await reportErrorToDevPulse({
      level: 'critical',
      message: err.message,
      stack: err.stack,
      source: 'GET /fail/critical',
    });
    res.status(500).json({ error: err.message });
  }
});

// A recoverable error -> level "error" -> becomes a P2 incident.
app.get('/fail/error', async (req, res) => {
  try {
    throw new Error('Downstream payment API returned 502');
  } catch (err) {
    await reportErrorToDevPulse({
      level: 'error',
      message: err.message,
      stack: err.stack,
      source: 'GET /fail/error',
    });
    res.status(502).json({ error: err.message });
  }
});

// A degraded-but-not-broken condition -> level "warning" -> a blocker,
// not an incident.
app.get('/fail/warning', async (req, res) => {
  const message = 'Cache miss rate above 80% for the last 5 minutes';
  await reportErrorToDevPulse({
    level: 'warning',
    message,
    source: 'GET /fail/warning',
  });
  res.json({ warning: message });
});

app.listen(PORT, () => {
  console.log(`demo-external-project listening on :${PORT}`);
});
