# DevPulse Project Status
*Updated 2026-09-14, 13 days to presentation (Sept 27)*

## What DevPulse is

An agentic WhatsApp assistant for an engineering team's daily ops: team
members log status updates, report incidents/blockers, track
deployments, and get automated reminders and severity-based escalation,
all conversationally, via text or voice, in English or Urdu/Roman Urdu.

---

## Built and confirmed working

### Data layer
PostgreSQL on Neon, full schema applied (`schema.sql`), users, profiles,
incidents, task_logs, deployments, blockers, reminders,
escalation_contacts, escalation_events. All core tools also covered by an
automated `node:test` suite where they're pure/DB-free (`backend/test/`),
and everything else verified via direct execution and live WhatsApp
testing (see `TESTING.md`).

### Agent
Groq-based tool-calling agent (`openai/gpt-oss-120b`), bounded
multi-round tool loop, system prompt in `prompts/system_prompt.txt`.
Conversation memory, "restart" command, tool-alias fallback for
near-miss tool names.

### WhatsApp integration (Meta Cloud API)
Webhook signature verification, text and voice round trips confirmed
live: task log, incident (with escalation prompt), blocker, deployment.

### Onboarding
`src/agent/onboarding.js`, a real conversational registration flow, not
just backing tools. An unrecognized WhatsApp number is routed through a
dedicated LLM+tool loop (`createUser` → `upsertProfile` →
`addEscalationContact` (optional) → `completeOnboarding`) before it ever
reaches the main agent. Wired into `webhook.js` via the
`onboarding_complete` profile flag.

### Duplicate detection
Before creating a new incident/blocker, the agent checks the user's open
records for a plausible match and asks for confirmation; a per-user
cross-turn state machine (`pendingDupConfirmation` in `graph.js`) gates
the update tool so the write only happens on the confirmed turn, not the
asking turn. Verified live, including the previously-broken case where
the write fired a turn too early.

### Voice (both directions)
- **Voice-in:** WhatsApp voice note → Groq Whisper (auto-detect, with a
  conditional retry to forced Urdu if detection lands outside en/ur) →
  transcript. Confirmed live for English, Urdu, Roman Urdu, and
  code-switched speech.
- **Language tagging:** deterministic, rule-based classifier
  (`languageTag.js`, not LLM-based, LLM inference was found
  non-deterministic even at temperature 0), tags voice transcripts
  before they reach the agent. Covered by an automated test suite
  (8 cases from `TEST_CASES.md`'s TC-LNG series).
- **Voice-out:** self-hosted VITS/MMS TTS models (English + Urdu), not
  `gtts`. Urdu synthesis includes an LLM transliteration/phonetic-
  rendering step so embedded English terms (e.g. "P1", "severity")
  aren't silently dropped by the Urdu tokenizer, a real bug found and
  fixed via live testing.
- Reply modality matches input modality, with fallback to text if TTS
  fails.

### Reports
PDF activity report and PDF open-blockers list, both generated
(`pdfkit`) and sent as WhatsApp documents on request.

### Scheduling (n8n + cron routes)
Three secret-authenticated endpoints (`/cron/reminders`,
`/cron/missed-checkins`, `/cron/stale-blockers`), each wired to an n8n
workflow on a schedule and each with its own de-dup guard so re-running
a sweep before the underlying condition changes is a safe no-op, not a
repeat notification/escalation. Tested deliberately under repeated/
back-to-back firing to confirm the guards hold.

### Escalation
`evaluateEscalation` logs an `escalation_events` row and sends a real
WhatsApp message to the user's configured escalation contact (not just
a DB write) when triggered, P1 incident, high-severity blocker, or a
blocker stale past the configured threshold.

### Jira integration
Best-effort, non-blocking issue creation on `reportIncident`/
`reportBlocker` (`services/jira/jiraClient.js`), a Jira failure never
blocks the underlying record. `jira_issue_key` stored on the record and
mentioned in the agent's confirmation reply.

### Infrastructure
Permanent System User access token, `.env`-based config (confirmed
gitignored, never committed), automated CI (`.github/workflows/ci.yml`)
running syntax checks, a Docker build check, a backend boot/health
check, and the unit test suite on every push.

### Automatic project-activity logging
Added per advisor feedback: activity logging shouldn't depend only on a
developer manually reporting it over WhatsApp. A new CI job
(`log-commit-activity`) fires on every push, builds a commit-log payload
from GitHub's own push event, and posts it to a new secret-authenticated
endpoint (`/logs/ingest-commits`) that indexes each commit into a
self-hosted OpenSearch instance (`backend/docker-compose.yml`; the
Apache-2.0 open-source fork of the Elasticsearch stack, not Elasticsearch
itself, which moved to a source-available license in 2021). The agent
gained a matching read-side tool, `queryProjectActivity`, so a user can
ask "what's changed in the codebase recently?" and get a real answer
backed by actual commits. Verified end-to-end locally: real commits
ingested, a genuine bug found and fixed in the process (OpenSearch's
default text tokenizer keeps file extensions attached to filenames, e.g.
`escalationruletool.js` as one token, so a plain search for
"escalationRuleTool" without the extension silently returned nothing
until the query was switched to a wildcard match). CI→backend wiring
itself still needs the `BACKEND_URL`/`LOG_INGEST_SECRET` GitHub repo
secrets set (see `docs/DEPLOYMENT.md` §4a) - until then the CI job logs
what it would have sent and exits cleanly rather than failing the build.

Extended further: every real inbound WhatsApp message is now also
indexed (`devpulse-webhook-hits`), independent of commit logging -
**verified with a real message**, not just backfilled test data (two
genuine hits landed and were confirmed via the read endpoint after
sending "hi" from WhatsApp). A minimal built-in status page
(`/dashboard`) and the full **OpenSearch Dashboards** UI (self-hosted,
reverse-proxied through the backend at `/opensearch-dashboards` so it
shares the one ngrok tunnel rather than needing a second) both went in
on top of this. The proxy needed a real fix along the way (a
`SERVER_BASEPATH`/`SERVER_REWRITEBASEPATH` mismatch that produced 404s
on every proxied request) - fixed, and now **confirmed working against
the actual running dev instance** (not just the earlier isolated test):
reached live through the real ngrok tunnel at
`/opensearch-dashboards/app/home#/`, publicly, not just on localhost.

### Automatic error intake from connected external projects
A distinct capability from the above: this is for real errors from a
**team's own external project** (not DevPulse's own code), POSTed to
`POST /logs/ingest-error` from that project's own error-handler/CI.
Deliberately reuses `reportIncident`/`reportBlocker` directly rather
than a separate auto-escalation path, so an auto-detected P1 gets
identical escalation + Jira behavior to a human-reported one, with no
risk of the two paths drifting apart. A dedicated, auto-created system
user (`system-monitoring`) owns these records so they're never
misattributed to a real team member; a repeated identical error
refreshes timing instead of duplicating, same principle as the agent's
own dedup flow. Readable back via a new `queryRecentErrors` agent tool
and a third panel on the status dashboard.

**Verified end-to-end with a real synthetic error, not just code
review**: POSTed a real "critical" error for a fictitious "TestApp"
project and confirmed all of the following actually happened - a real
incident record created (`P1` severity), a real escalation WhatsApp
message sent (confirmed via the `escalation_events` row, `notified_contact`
correctly resolved to the configured number), and a real Jira issue
created (`SCRUM-14`). Also verified a second, distinct low-severity
error correctly became a blocker instead, with no escalation (matching
the existing rule that only high-severity blockers escalate
immediately) and its own real Jira issue. All synthetic test artifacts
(the incident row, the blocker row, both Jira issues) were deleted
afterward - the "TestApp" data was a deliberate one-off verification,
not left behind as fake demo data.

---

## Genuinely still open

- **Escalation contact live-notify with a real second number**, the
  code path sends a real WhatsApp message, but this hasn't been
  confirmed against an actual second WhatsApp number receiving it.
  Step-by-step in `docs/LIVE_TEST_CHECKLIST.md` section A, needs you to
  actually run it with a second phone; not something that can be
  verified without one.
- **Multi-user testing**, all testing to date has been single-user.
  Step-by-step in `docs/LIVE_TEST_CHECKLIST.md` section B, same
  constraint, needs a second real device.
- **Deployment to a persistent host**, **decided**: staying local +
  ngrok for the demo rather than standing up and hardening a new host
  this close to the presentation (see `docs/DEPLOYMENT.md` section 0).
  A static ngrok domain would remove the URL-rotation risk, but turned
  out to require a paid plan on this account, not free as first assumed
  - accepting the rotating URL and relying on the pre-demo checklist
  instead.
- **Credential rotation**: **done**. Groq, WhatsApp access token, Jira
  API token, and now the WhatsApp **App Secret** are all rotated and
  directly verified (each against a real check on the new credential,
  not just assumed from a restart) - the App Secret needed the actual
  "Reset app secret" action (not just "Show", which only re-reveals the
  current value), then was verified via three live requests against the
  webhook's HMAC signature check: new-secret-signed accepted (200),
  old-secret-signed rejected (401), unsigned rejected (401). See
  `docs/CREDENTIAL_ROTATION.md` for the detail.
- **Presentation materials**, `docs/DEMO_SCRIPT.md` now exists,
  grounded in real verified test cases from `docs/TESTING.md` (not
  invented dialogue), five flows: text logging, Urdu voice, duplicate
  detection, Jira mirroring, P1 escalation. Slides still don't exist.
- **CI → backend wiring for commit-log ingestion**, the code path is
  built and verified end-to-end locally, but the actual GitHub Actions
  job has never fired against a real live backend yet - needs
  `BACKEND_URL`/`LOG_INGEST_SECRET` set as GitHub repo secrets. A static
  ngrok domain would make `BACKEND_URL` stable, but **update**: a custom
  -named free static domain turned out to require a paid ngrok plan on
  this account (every name typed in the dashboard showed "Requires
  Upgrade") - `docs/DEPLOYMENT.md` §0's original claim that this was
  free was wrong for this account tier, corrected here. Until this is
  set up, stick with the pre-demo checklist in §0 (re-verify and
  re-point the webhook manually before demos) rather than relying on a
  stable `BACKEND_URL`.
- **Connected-project error intake**: code-level flow verified
  end-to-end with a real synthetic error (see above), and now also with
  a **genuine error from a real connected project**: `ai-services`
  (`error_report.py`) reports its own real failures (e.g. a Groq
  transcription rejecting an invalid audio file) via the exact same
  `/logs/ingest-error` path a third-party team would use - confirmed via
  a real triggered failure producing a real `P2` incident and Jira issue
  (`SCRUM-15`), not a mock. `docs/CONNECTING_A_PROJECT.md` now exists as
  a copy-paste-ready integration guide for handing to another team, with
  two connection methods: a runtime error-handler snippet (Node/Python),
  or a CI/CD-only option (a GitHub Actions job that fires `if: failure()`
  and needs zero app code changes on the connected project's side -
  mirrors DevPulse's own `log-commit-activity` CI job). No actual
  third-party team's project has connected yet - that's still open, it
  needs an external team to actually use it.

---

## Recommended order for remaining 16 days

Nearly everything functional is done, this is now mostly a
rehearsal/polish list, not a build list.

1. **Done:** credential rotation (`docs/CREDENTIAL_ROTATION.md`) - all
   three (Groq, WhatsApp access token, WhatsApp App Secret, Jira) rotated
   and verified.
2. **Next:** run `docs/LIVE_TEST_CHECKLIST.md` (needs a second phone),
   escalation live-notify and a multi-user pass.
3. **Final week:** slides (demo script and talking points are already
   written in `docs/DEMO_SCRIPT.md`), then rehearse the five flows in
   that script end to end at least once before the actual presentation.

---

## Known honest caveats to mention in your viva/presentation
- Roman Urdu handling relies on a general-purpose LLM for
  transliteration (Groq), not a model fine-tuned for the task, good but
  not perfect on rare/ambiguous words.
- Self-hosted TTS runs on CPU in the current deployment target; a local
  Urdu LLM alternative was evaluated for a different sub-task and
  measured too slow (~2.4 tok/s) to be usable, which is why STT and
  agent reasoning stay on Groq's hosted API rather than being
  self-hosted too.
- Groq's free tier caps at 200,000 tokens/day, organization-wide, real
  testing during this project has hit that cap more than once.
- Running locally + ngrok, not on a persistent server, a deliberate
  choice for a scoped demo (see `docs/DEPLOYMENT.md` section 0), would
  need real deployment for production use.
- WhatsApp Cloud API test number is capped at 5 verified recipients,
  sufficient for a demo, not a real team rollout without completing
  Meta's production number setup.
- Jira mirroring, duplicate detection, and the automated test suite are
  all real, working, and demo-able, worth leading with, since they go
  beyond what a "scaffold" FYP typically has by this stage.
