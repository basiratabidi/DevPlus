import express from 'express';
import { indexCommitLog } from '../services/opensearch/client.js';

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
