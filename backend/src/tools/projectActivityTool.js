import { searchCommitLogs } from '../services/opensearch/client.js';

/**
 * Lets the agent answer "what's changed in the codebase recently?"
 * style questions from real commit data, not from anything a developer
 * had to type into WhatsApp - the commits are ingested automatically by
 * CI (see routes/logs.js and .github/workflows/ci.yml).
 */
export async function queryProjectActivity({ query = null, limit = 10 } = {}) {
  const commits = await searchCommitLogs({ query, limit });
  return { commits, count: commits.length };
}
