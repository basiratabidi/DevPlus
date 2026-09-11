import dotenv from 'dotenv';
dotenv.config();

/**
 * Jira Cloud REST API v3 client (basic auth with an API token).
 * NOTE: this shape (Basic auth, /rest/api/3/issue, ADF description body)
 * follows Atlassian's current documented API, but hasn't been tested
 * against a real Jira instance yet - no credentials were available
 * during development. Sanity-check the first real call and adjust if
 * Jira returns a validation error naming a specific field.
 */

function isConfigured() {
  return Boolean(
    process.env.JIRA_BASE_URL &&
    process.env.JIRA_EMAIL &&
    process.env.JIRA_API_TOKEN &&
    process.env.JIRA_PROJECT_KEY
  );
}

function authHeader() {
  const raw = `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

function toADF(text) {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

/**
 * Creates a Jira issue. Returns the created issue's key (e.g. "PROJ-123"),
 * or null if Jira isn't configured (JIRA_* env vars unset) - callers
 * should treat Jira as an optional, best-effort side effect, not a
 * required dependency for DevPulse's own incident/blocker tracking.
 */
export async function createJiraIssue({ summary, description, issueType }) {
  if (!isConfigured()) {
    return null;
  }

  const url = `${process.env.JIRA_BASE_URL.replace(/\/$/, '')}/rest/api/3/issue`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: process.env.JIRA_PROJECT_KEY },
        summary,
        description: toADF(description || summary),
        issuetype: { name: issueType },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira create issue failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return data.key;
}
