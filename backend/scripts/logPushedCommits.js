import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Gathers recent git commit metadata and posts it to the backend's
 * ingestion endpoint, same shape the CI job's push-event data uses.
 * Useful for local testing without waiting on a real GitHub push, and
 * as a manual fallback if you want to log history retroactively.
 *
 * Usage: node scripts/logPushedCommits.js [count]  (default count: 1)
 */

const count = Number(process.argv[2]) || 1;
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
const secret = process.env.LOG_INGEST_SECRET;

if (!secret) {
  console.error('LOG_INGEST_SECRET not set in backend/.env - required to authenticate the ingest call.');
  process.exit(1);
}

const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';
const log = execSync(
  `git log -${count} --pretty=format:"%H${FIELD_SEP}%an${FIELD_SEP}%s${FIELD_SEP}%aI${RECORD_SEP}"`,
  { encoding: 'utf-8' }
);

const commits = log
  .split(RECORD_SEP)
  .map((r) => r.trim())
  .filter(Boolean)
  .map((record) => {
    const [sha, author, message, timestamp] = record.split(FIELD_SEP);
    const filesChanged = execSync(`git show --name-only --pretty=format: ${sha}`, { encoding: 'utf-8' })
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    return { sha, author, message, timestamp, filesChanged };
  });

const response = await fetch(`${backendUrl}/logs/ingest-commits`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-log-ingest-secret': secret,
  },
  body: JSON.stringify({ commits }),
});

const result = await response.json();
console.log(`Ingest response (${response.status}):`, result);
