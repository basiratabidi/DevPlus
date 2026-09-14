// Reusable client for reporting this app's own errors to DevPulse.
// Mirrors the Node.js snippet in docs/CONNECTING_A_PROJECT.md (Option B)
// and ai-services/error_report.py's pattern: best-effort, never throws.

const PROJECT_NAME = process.env.DEVPULSE_PROJECT_NAME || 'demo-external-project';

export async function reportErrorToDevPulse({ level, message, stack, source }) {
  const backendUrl = process.env.DEVPULSE_BACKEND_URL;
  const secret = process.env.DEVPULSE_LOG_INGEST_SECRET;

  if (!backendUrl || !secret) {
    console.warn(
      'DEVPULSE_BACKEND_URL / DEVPULSE_LOG_INGEST_SECRET not set - skipping error report to DevPulse.'
    );
    return;
  }

  try {
    const res = await fetch(`${backendUrl}/logs/ingest-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-log-ingest-secret': secret,
      },
      body: JSON.stringify({ project: PROJECT_NAME, level, message, stack, source }),
    });
    if (!res.ok) {
      console.error(`DevPulse ingest-error responded with ${res.status}`);
    }
  } catch (err) {
    // Best-effort - a monitoring call failing must never break this app.
    console.error('Failed to report error to DevPulse:', err.message);
  }
}
