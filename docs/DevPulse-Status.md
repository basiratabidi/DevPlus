# DevPulse — Project Status
*Updated 2026-09-11 — 16 days to presentation (Sept 27)*

## What DevPulse is

An agentic WhatsApp assistant for an engineering team's daily ops: team
members log status updates, report incidents/blockers, track
deployments, and get automated reminders and severity-based escalation —
all conversationally, via text or voice, in English or Urdu/Roman Urdu.

---

## Built and confirmed working

### Data layer
PostgreSQL on Neon, full schema applied (`schema.sql`) — users, profiles,
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
`src/agent/onboarding.js` — a real conversational registration flow, not
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
  (`languageTag.js`, not LLM-based — LLM inference was found
  non-deterministic even at temperature 0), tags voice transcripts
  before they reach the agent. Covered by an automated test suite
  (8 cases from `TEST_CASES.md`'s TC-LNG series).
- **Voice-out:** self-hosted VITS/MMS TTS models (English + Urdu), not
  `gtts`. Urdu synthesis includes an LLM transliteration/phonetic-
  rendering step so embedded English terms (e.g. "P1", "severity")
  aren't silently dropped by the Urdu tokenizer — a real bug found and
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
a DB write) when triggered — P1 incident, high-severity blocker, or a
blocker stale past the configured threshold.

### Jira integration
Best-effort, non-blocking issue creation on `reportIncident`/
`reportBlocker` (`services/jira/jiraClient.js`) — a Jira failure never
blocks the underlying record. `jira_issue_key` stored on the record and
mentioned in the agent's confirmation reply.

### Infrastructure
Permanent System User access token, `.env`-based config (confirmed
gitignored, never committed), automated CI (`.github/workflows/ci.yml`)
running syntax checks, a Docker build check, a backend boot/health
check, and the unit test suite on every push.

---

## Genuinely still open

- **Escalation contact live-notify with a real second number** — the
  code path sends a real WhatsApp message, but this hasn't been
  confirmed against an actual second WhatsApp number receiving it
  (only exercised with `notified: false`/no-contact-configured cases so
  far, as far as this session has verified).
- **Multi-user testing** — all testing to date has been single-user;
  behavior with 2+ distinct WhatsApp numbers interacting concurrently
  hasn't been confirmed. Disclosed as a known limitation in
  `docs/PROPOSAL.md`.
- **Deployment to a persistent host** — explicitly paused earlier in
  this project; still running locally. This is the one remaining item
  from the original "task 4" list (Jira, dedup, and scheduledFor — the
  other three — are all done).
- **Credential rotation** — a real Groq API key, WhatsApp access token/
  app secret, and Jira API token have all been pasted in plaintext into
  chat sessions during development. `.env` itself is gitignored and was
  never committed, but the values were still exposed in conversation
  history and should be rotated before any public demo or handoff.
- **Presentation materials** — `docs/PROPOSAL.md`, `docs/SRS.md`,
  `docs/SDS.md` (with Mermaid architecture/ER/sequence diagrams), and
  `docs/TEST_CASES.md` now exist and cover the written-documentation
  side. Slides and a rehearsed demo script do not exist yet.

---

## Recommended order for remaining 16 days

Nearly everything functional is done — this is now mostly a
deployment/polish/rehearsal list, not a build list.

1. **This week:** decide on and execute deployment to a persistent host
   (or explicitly decide to demo locally instead — either is fine, but
   should be a decision, not a default by inaction), rotate the
   credentials that were pasted in plaintext during development.
2. **Next:** confirm escalation contact live-notify with a real second
   WhatsApp number; if time allows, a short multi-user pass (2 numbers
   interacting concurrently).
3. **Final week:** slides + demo script (written docs are already done),
   rehearsal covering: a text flow, a voice flow in Urdu, a duplicate-
   incident confirmation, and a Jira-mirrored incident — these four
   demonstrate the project's actual differentiators.

---

## Known honest caveats to mention in your viva/presentation
- Roman Urdu handling relies on a general-purpose LLM for
  transliteration (Groq), not a model fine-tuned for the task — good but
  not perfect on rare/ambiguous words.
- Self-hosted TTS runs on CPU in the current deployment target; a local
  Urdu LLM alternative was evaluated for a different sub-task and
  measured too slow (~2.4 tok/s) to be usable, which is why STT and
  agent reasoning stay on Groq's hosted API rather than being
  self-hosted too.
- Groq's free tier caps at 200,000 tokens/day, organization-wide — real
  testing during this project has hit that cap more than once.
- Currently running locally, not on a persistent server — fine for a
  scoped demo, would need real deployment for production use.
- WhatsApp Cloud API test number is capped at 5 verified recipients —
  sufficient for a demo, not a real team rollout without completing
  Meta's production number setup.
- Jira mirroring, duplicate detection, and the automated test suite are
  all real, working, and demo-able — worth leading with, since they go
  beyond what a "scaffold" FYP typically has by this stage.
