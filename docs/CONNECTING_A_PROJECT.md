# Connecting your project to DevPulse

This is what to hand to another team: everything needed to get *your*
project's real errors showing up as DevPulse incidents/blockers, with
automatic escalation and Jira ticketing, no DevPulse code changes on
your side.

## The journey, end to end

1. **A team hears about DevPulse** and wants their project's errors to
   show up as real incidents/blockers instead of living only in their
   own logs - the pitch is: connect once, get free escalation + Jira
   ticketing on top, no new tool for their team to learn.
2. **They ask the DevPulse owner for two values**: the backend's URL and
   the shared `LOG_INGEST_SECRET` (see below). This is a short manual
   handoff (message, shared secrets doc), not a self-serve signup form -
   there's no registration UI or account system to sign up through.
3. **They pick a connection method** based on what they want covered:
   - Want CI/build failures reported with zero app code changes? Add
     one job to their existing CI workflow (Option A below).
   - Want real runtime errors from their deployed app? Add one small
     function called from their existing error handlers (Option B
     below).
   - Nothing stops them doing both.
4. **They make one test call** (a deliberate failure, or the snippet's
   example usage) and confirm it landed - ask a DevPulse user to check
   "any recent errors from `<project>`?" over WhatsApp, or check the
   OpenSearch dashboard / `/logs/recent-errors`.
5. **From then on it's automatic** - every real error/failure that hits
   their instrumented code path or CI job reports itself, with no further
   action from their side. No DevPulse-side registration step to
   remember, no dashboard to configure - the `project` name they chose
   in step 3 is all that identifies them going forward.

## What you need from the DevPulse owner
- The backend's URL (`BACKEND_URL` below) - a demo/local setup will be
  an ngrok URL that can rotate; ask for the current one.
- The shared `LOG_INGEST_SECRET` value.

Both are secrets - store them the way you'd store any other API
credential (environment variable / secrets manager), never commit them.

## The call

```
POST {BACKEND_URL}/logs/ingest-error
Content-Type: application/json
x-log-ingest-secret: {LOG_INGEST_SECRET}

{
  "project": "MyApp",
  "level": "critical",
  "message": "DB connection refused",
  "stack": "...",
  "source": "checkout-service"
}
```

| Field | Required | Notes |
|---|---|---|
| `project` | yes | Your project's name - groups your errors and becomes the `[project]` prefix on the resulting incident/blocker title. |
| `message` | yes | Short error description. |
| `level` | no | `critical`/`fatal`/`error` → incident (P1/P2). Anything else (e.g. `warning`) → blocker. Omitted → lowest severity blocker. |
| `stack` | no | Full stack trace / details, stored as the incident/blocker description. |
| `source` | no | Where in your code this fired (endpoint, function, job name). |

A repeated identical error (same `project` + `message`, still open)
just refreshes the existing record instead of creating a duplicate - call
this from a real error handler or `catch` block without worrying about
spamming DevPulse on a hot failure loop.

There are two ways to send this - pick whichever fits your project.

## Option A: from your CI/CD pipeline (no app code changes)

The lowest-effort option: add one job to your existing GitHub Actions
workflow that fires when your build/tests fail and reports it directly -
nothing to change in your application code at all. This is the exact
same pattern DevPulse uses on itself for commit-activity logging
(`.github/workflows/ci.yml`'s `log-commit-activity` job).

```yaml
report-ci-failure:
  name: Report CI failure to DevPulse
  runs-on: ubuntu-latest
  needs: [test]  # replace with your actual job name(s) to watch
  if: failure()
  # Best-effort by design - DevPulse being unreachable must never fail
  # your build.
  continue-on-error: true
  steps:
    - name: Report failure to DevPulse
      env:
        BACKEND_URL: ${{ secrets.DEVPULSE_BACKEND_URL }}
        LOG_INGEST_SECRET: ${{ secrets.DEVPULSE_LOG_INGEST_SECRET }}
      run: |
        curl -sf -X POST "$BACKEND_URL/logs/ingest-error" \
          -H "Content-Type: application/json" \
          -H "x-log-ingest-secret: $LOG_INGEST_SECRET" \
          -d '{
            "project": "MyApp",
            "level": "error",
            "message": "CI failed on ${{ github.ref_name }} (${{ github.sha }})",
            "source": "github-actions",
            "stack": "Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          }' || echo "::warning::Failed to report CI failure to DevPulse - non-blocking."
```

Add `DEVPULSE_BACKEND_URL` and `DEVPULSE_LOG_INGEST_SECRET` as repo
secrets (Settings → Secrets and variables → Actions), set `needs:` to
whichever of your existing job(s) should trigger this on failure, and
you're connected. Every red CI run becomes a real DevPulse incident.

This reports *build/test failures*, not runtime errors your deployed
app hits in production - for those, use Option B below.

## Option B: from your own error handler (runtime errors)

For errors that happen in your running app (not just CI), call the
endpoint directly from a `catch` block or error handler.

### Node.js

```js
async function reportErrorToDevPulse({ level, message, stack, source }) {
  try {
    await fetch(`${process.env.DEVPULSE_BACKEND_URL}/logs/ingest-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-log-ingest-secret': process.env.DEVPULSE_LOG_INGEST_SECRET,
      },
      body: JSON.stringify({ project: 'MyApp', level, message, stack, source }),
    });
  } catch (err) {
    // Best-effort - a monitoring call failing must never break your app.
    console.error('Failed to report error to DevPulse:', err);
  }
}

// Usage:
try {
  await riskyOperation();
} catch (err) {
  await reportErrorToDevPulse({
    level: 'error',
    message: err.message,
    stack: err.stack,
    source: 'riskyOperation',
  });
  throw err;
}
```

### Python

```python
import os
import traceback
import requests

def report_error_to_devpulse(level: str, message: str, stack: str = "", source: str = ""):
    try:
        requests.post(
            f"{os.environ['DEVPULSE_BACKEND_URL']}/logs/ingest-error",
            headers={"x-log-ingest-secret": os.environ["DEVPULSE_LOG_INGEST_SECRET"]},
            json={"project": "MyApp", "level": level, "message": message, "stack": stack, "source": source},
            timeout=5,
        )
    except requests.RequestException as e:
        # Best-effort - a monitoring call failing must never break your app.
        print(f"Failed to report error to DevPulse: {e}")

# Usage:
try:
    risky_operation()
except Exception as e:
    report_error_to_devpulse(
        level="error",
        message=str(e),
        stack=traceback.format_exc(),
        source="risky_operation",
    )
    raise
```

*(This is the exact pattern DevPulse's own `ai-services` component uses
to report its own errors back to itself - see
`ai-services/error_report.py`.)*

## What happens after you POST
1. Indexed into DevPulse's OpenSearch error log (audit trail, always).
2. Deduped against your project's existing open incidents/blockers.
3. A real incident or blocker record is created, attributed to an
   auto-created `system-monitoring` user (never mistaken for a real
   team member's report).
4. If it's a P1 incident or high-severity blocker, DevPulse sends a real
   WhatsApp message to its configured on-call contact - same escalation
   path a human-reported P1 gets.
5. A real Jira issue is created (if DevPulse's Jira integration is
   configured) and its key stored on the record.
6. Anyone on the DevPulse WhatsApp can then ask "any recent errors from
   MyApp?" and get a real answer.

See `docs/DEPLOYMENT.md` §4b for the DevPulse-side implementation
details.
