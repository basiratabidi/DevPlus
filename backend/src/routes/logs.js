import express from 'express';
import { indexCommitLog, searchCommitLogs, recentWebhookHits, recentErrorLogs, errorsByProject } from '../services/opensearch/client.js';
import { ingestProjectError } from '../tools/errorIngestTool.js';

export const logsRouter = express.Router();

function requireLogIngestSecret(req, res, next) {
  const secret = req.headers['x-log-ingest-secret'];
  if (!process.env.LOG_INGEST_SECRET || secret !== process.env.LOG_INGEST_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

/**
 * Hit by the "log-commit-activity" CI job (.github/workflows/ci.yml) on
 * every push - this is how project-activity logging stays independent
 * of any developer manually reporting it: the pipeline inspects the
 * actual commits and reports them itself.
 *
 * Body: { commits: [{ sha, author, message, timestamp, filesChanged }] }
 */
logsRouter.post('/logs/ingest-commits', requireLogIngestSecret, async (req, res) => {
  const commits = Array.isArray(req.body?.commits) ? req.body.commits : [];
  if (commits.length === 0) {
    return res.json({ indexed: 0 });
  }

  let indexed = 0;
  for (const commit of commits) {
    try {
      await indexCommitLog(commit);
      indexed++;
    } catch (err) {
      // Best-effort per commit, same reasoning as the Jira integration -
      // one bad/duplicate document shouldn't block the rest of the batch.
      console.error('Failed to index commit log', commit.sha, err);
    }
  }

  res.json({ indexed, total: commits.length });
});

/**
 * Hit by a *connected external project's* own CI/error-handler when a
 * real error occurs there - not DevPulse's own code. Reuses
 * reportIncident/reportBlocker directly, so an auto-detected P1 gets
 * the exact same escalation + Jira behavior a human-reported one would.
 *
 * Body: { project, level, message, stack?, source? }
 * level: "critical"/"fatal"/"error" -> incident (P1/P2), "warning"/other -> blocker
 */
logsRouter.post('/logs/ingest-error', requireLogIngestSecret, async (req, res) => {
  const { project, level, message, stack, source } = req.body || {};
  if (!project || !message) {
    return res.status(400).json({ error: 'project and message are required' });
  }

  try {
    const result = await ingestProjectError({ project, level, message, stack, source });
    res.json(result);
  } catch (err) {
    console.error('logs/ingest-error error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Read-only - backs the status dashboard (public/dashboard.html). Not
// secret-gated like ingestion: nothing destructive here, and this is a
// local/demo deployment. Would need real auth before any non-local use.
logsRouter.get('/logs/recent-commits', async (req, res) => {
  try {
    const commits = await searchCommitLogs({ limit: 20 });
    res.json({ commits });
  } catch (err) {
    console.error('logs/recent-commits error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

logsRouter.get('/logs/recent-webhook-hits', async (req, res) => {
  try {
    const hits = await recentWebhookHits({ limit: 20 });
    res.json({ hits });
  } catch (err) {
    console.error('logs/recent-webhook-hits error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

logsRouter.get('/logs/recent-errors', async (req, res) => {
  try {
    const errors = await recentErrorLogs({ limit: 20 });
    res.json({ errors });
  } catch (err) {
    console.error('logs/recent-errors error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Per-connected-project rollup (total errors, last-seen, level mix) -
// backs the status dashboard's "Connected Projects" section, same
// read-only/not-secret-gated reasoning as the other /logs/recent-* routes.
logsRouter.get('/logs/errors-by-project', async (req, res) => {
  try {
    const projects = await errorsByProject({ limit: 20 });
    res.json({ projects });
  } catch (err) {
    console.error('logs/errors-by-project error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});
