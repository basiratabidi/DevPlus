import dotenv from 'dotenv';
dotenv.config();

/**
 * Thin OpenSearch REST client (no official SDK - same fetch-based
 * pattern as jiraClient.js). Security plugin is disabled on the local
 * OpenSearch instance (see backend/docker-compose.yml), so no auth
 * header is needed for these calls - this client is only ever reached
 * from the backend itself, never exposed directly to the internet.
 */

const COMMIT_LOGS_INDEX = 'devpulse-commit-logs';
const WEBHOOK_HITS_INDEX = 'devpulse-webhook-hits';
const ERROR_LOGS_INDEX = 'devpulse-error-logs';

function baseUrl() {
  return (process.env.OPENSEARCH_URL || 'http://localhost:9200').replace(/\/$/, '');
}

function isConfigured() {
  return Boolean(process.env.OPENSEARCH_URL);
}

/**
 * Indexes one commit as a log document. Best-effort by design (mirrors
 * Jira integration): a log store being down should never block anything
 * else in the system, so callers should catch and log, not propagate.
 */
export async function indexCommitLog(commit) {
  if (!isConfigured()) return null;

  const response = await fetch(`${baseUrl()}/${COMMIT_LOGS_INDEX}/_doc/${commit.sha}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(commit),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenSearch index failed: ${response.status} ${body}`);
  }

  return response.json();
}

/**
 * Full-text searches commit logs (message, author, files changed) and
 * returns the most recent matches first. Used by the agent tool so
 * DevPulse can answer "what's changed in the codebase recently?"
 * without a human having logged anything about it.
 */
export async function searchCommitLogs({ query, limit = 10 } = {}) {
  if (!isConfigured()) return [];

  // filesChanged is analyzed text - Lucene's standard tokenizer keeps
  // extensions attached to the filename (e.g. "escalationruletool.js" as
  // one token, found via direct _analyze inspection), so a plain match
  // query silently misses a search like "escalationRuleTool" without the
  // ".js". A case-insensitive wildcard against the untokenized .keyword
  // subfield handles partial filename/path matches correctly instead.
  const body = query
    ? {
        query: {
          bool: {
            should: [
              { match: { message: query } },
              { match: { author: query } },
              { wildcard: { 'filesChanged.keyword': { value: `*${query}*`, case_insensitive: true } } },
            ],
          },
        },
        sort: [{ timestamp: 'desc' }],
        size: limit,
      }
    : {
        query: { match_all: {} },
        sort: [{ timestamp: 'desc' }],
        size: limit,
      };

  const response = await fetch(`${baseUrl()}/${COMMIT_LOGS_INDEX}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 404) return []; // index doesn't exist yet - no commits logged so far
    const errBody = await response.text();
    throw new Error(`OpenSearch search failed: ${response.status} ${errBody}`);
  }

  const data = await response.json();
  return data.hits.hits.map((hit) => hit._source);
}

/**
 * Indexes one inbound WhatsApp webhook hit (real system activity, not
 * something a developer reported) - powers the status dashboard's
 * "recent webhook hits" view. Best-effort: never block or fail the
 * actual webhook handling because logging it failed.
 */
export async function indexWebhookHit(hit) {
  if (!isConfigured()) return null;

  const response = await fetch(`${baseUrl()}/${WEBHOOK_HITS_INDEX}/_doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...hit, timestamp: hit.timestamp || new Date().toISOString() }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenSearch index failed: ${response.status} ${body}`);
  }

  return response.json();
}

/**
 * Most recent webhook hits, newest first - used by the status dashboard.
 */
export async function recentWebhookHits({ limit = 20 } = {}) {
  if (!isConfigured()) return [];

  const response = await fetch(`${baseUrl()}/${WEBHOOK_HITS_INDEX}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: { match_all: {} },
      sort: [{ timestamp: 'desc' }],
      size: limit,
    }),
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    const body = await response.text();
    throw new Error(`OpenSearch search failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return data.hits.hits.map((hit) => hit._source);
}

/**
 * Indexes one real error reported by a connected external project (not
 * DevPulse's own code) - the audit trail persists here regardless of
 * whether an incident/blocker was also created for it.
 */
export async function indexErrorLog(errorLog) {
  if (!isConfigured()) return null;

  const response = await fetch(`${baseUrl()}/${ERROR_LOGS_INDEX}/_doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...errorLog, timestamp: errorLog.timestamp || new Date().toISOString() }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenSearch index failed: ${response.status} ${body}`);
  }

  return response.json();
}

/**
 * Most recent connected-project error logs, newest first.
 */
export async function recentErrorLogs({ limit = 20 } = {}) {
  if (!isConfigured()) return [];

  const response = await fetch(`${baseUrl()}/${ERROR_LOGS_INDEX}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: { match_all: {} },
      sort: [{ timestamp: 'desc' }],
      size: limit,
    }),
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    const body = await response.text();
    throw new Error(`OpenSearch search failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return data.hits.hits.map((hit) => hit._source);
}
