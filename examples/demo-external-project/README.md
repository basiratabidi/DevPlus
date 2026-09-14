# demo-external-project

A minimal, standalone app that plays the role of "an external team's
project" connected to DevPulse, so you can see the whole
[`CONNECTING_A_PROJECT.md`](../../docs/CONNECTING_A_PROJECT.md) flow
actually work end to end: a real error here becomes a real DevPulse
incident/blocker, with escalation and Jira ticketing, without touching
any DevPulse code.

It is intentionally tiny - one Express server, one HTTP client file,
one CI workflow - so it doubles as a copy-pasteable reference for
connecting a *real* project.

## What's in here

- `server.js` - a few routes, some of which fail on purpose.
- `devpulse.js` - the reusable `reportErrorToDevPulse()` client (same
  pattern as `ai-services/error_report.py` and the Node.js snippet in
  the docs), best-effort and never throws.
- `.github/workflows/ci.yml` - a CI job that reports a failed build
  straight to DevPulse (Option A - zero app code involved).
- `.env.example` - the two values you get from the DevPulse owner.

## Run it

```bash
cd examples/demo-external-project
npm install
cp .env.example .env   # fill in DEVPULSE_BACKEND_URL + DEVPULSE_LOG_INGEST_SECRET
npm start
```

Then, with the DevPulse backend running and reachable at
`DEVPULSE_BACKEND_URL`:

```bash
curl http://localhost:4100/work              # succeeds, reports nothing
curl http://localhost:4100/fail/critical     # -> P1 incident in DevPulse
curl http://localhost:4100/fail/error        # -> P2 incident in DevPulse
curl http://localhost:4100/fail/warning      # -> blocker in DevPulse
```

Confirm it landed by asking a DevPulse WhatsApp user "any recent
errors from demo-external-project?", or hitting the DevPulse backend's
`GET /logs/recent-errors`.

## Wiring a real project instead

Don't fork this app - copy `devpulse.js` (or its Python twin in the
docs) into your own project, call `reportErrorToDevPulse(...)` from
your real error handlers/`catch` blocks, and set the same three env
vars. See `docs/CONNECTING_A_PROJECT.md` for the full write-up,
including the CI-only option if you don't want to touch application
code at all.
