# DevPulse

An agentic WhatsApp assistant for an engineering team's daily ops. Team
members log status updates, report incidents/blockers, and track
deployments conversationally, by text or voice, in English, Urdu, or
Roman Urdu, instead of opening Slack, Jira, or a dashboard directly.

Architecture pattern (WhatsApp → LLM agent → controlled tools →
PostgreSQL, with n8n for time-based sweeps) mirrors a GlucoWhats-style
build, applied to a different case study.

## What's built and working

- **Conversational logging**: task updates, incidents (P1-P4 severity),
  blockers, deployments, via natural language, no rigid format.
- **Duplicate detection**: before logging a new incident/blocker, checks
  for a similar still-open one and asks for confirmation instead of
  creating a duplicate.
- **Voice (both directions)**: WhatsApp voice note → Groq Whisper
  (auto-detect language, with a retry-to-Urdu fallback if detection lands
  on an implausible language) → deterministic language tagging →
  agent → reply → self-hosted TTS (Meta MMS/VITS) → voice reply.
- **Multilingual, deterministically**: a rule-based (non-LLM) classifier
  tags each voice message as English/Urdu/Mixed before it reaches the
  agent, so reply-language selection doesn't depend on the LLM correctly
  inferring language from a possibly-noisy transcript.
- **Jira integration**: reporting an incident or blocker also creates a
  matching Jira issue automatically (best-effort, DevPulse stays the
  source of truth even if Jira is unreachable/misconfigured).
- **PDF reports**: activity summaries and open-blockers lists, generated
  and sent as WhatsApp documents.
- **Reminders & escalation**: standup/deployment reminders, and
  automatic escalation to a configured contact for P1 incidents or
  blockers open past a threshold, run via n8n cron workflows hitting
  `/cron/*` routes, with de-dup guards so the same event doesn't re-fire
  on every sweep.
- **Onboarding**: new team members register themselves conversationally
  via WhatsApp.
- **Automatic project-activity logging**: a CI job indexes every real
  commit into a self-hosted OpenSearch instance on push, no developer
  has to report it, and the agent can read it back (`queryProjectActivity`)
  to answer "what's changed in the codebase recently?".

## Architecture

```
WhatsApp (Meta Cloud API v25.0)
        |
   backend/  (Node.js, Express)
        |-- webhook.js         inbound message handling, dedup, signature verification
        |-- agent/graph.js     Groq-based tool-calling agent loop (multi-round)
        |-- agent/languageTag.js  deterministic EN/UR/MIXED classifier for voice input
        |-- tools/*            DB-backed tools the agent can call
        |-- services/jira/     Jira issue auto-creation
        |-- services/opensearch/  commit-log store client
        |-- routes/cron.js     endpoints polled by n8n (reminders, missed-checkins, stale-blockers)
        |-- routes/logs.js     endpoint hit by CI on every push (commit logging)
        |
        |--> ai-services/  (Python, FastAPI)        |--> PostgreSQL (Neon)
        |                                            |--> OpenSearch (self-hosted, commit logs)
              |-- transcribe.py    Groq Whisper STT
              |-- transliterate.py Roman Urdu -> Urdu script (Groq LLM)
              |-- text_to_speech.py  self-hosted VITS TTS
        |
        |--> n8n   scheduled sweeps for reminders/missed-checkins/stale-blockers
```

## Setup

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, GROQ_API_KEY, WhatsApp + Jira creds
psql "$DATABASE_URL" -f schema.sql
npm run dev
```

### ai-services
```bash
cd ai-services
docker compose up -d
```

### n8n
Import the workflow JSON files in `backend/n8n/` (reminders, missed
check-ins, stale blockers), point them at your backend's `/cron/*`
routes with the shared `CRON_SECRET`.

### Exposing the webhook locally
```bash
ngrok http 3000
```
Set the resulting HTTPS URL + `/webhook/whatsapp` as your Meta app's
webhook callback URL.

## Environment variables

See `backend/.env.example` for the full list. Required for core
functionality: `DATABASE_URL`, `GROQ_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
`CRON_SECRET`. Optional: `JIRA_*` (Jira integration is a no-op if unset),
`OPENSEARCH_URL` + `LOG_INGEST_SECRET` (without these, commit-log
ingestion won't run and `queryProjectActivity` returns no results -
everything else keeps working, see `docs/DEPLOYMENT.md` §4a).

## Known limitations

- **Groq free-tier rate limits**: the agent model has both a per-minute
  and a 200,000-tokens/day cap on the free/on-demand tier. Heavy testing
  or a busy demo day can exhaust this; the agent degrades gracefully
  (falls back to a plain confirmation rather than crashing) but won't
  produce full LLM replies until the quota resets. Consider Groq's paid
  Dev Tier before a live demo if this is a risk.
- **TTS for mixed-language replies**: the self-hosted VITS models are
  strictly per-language (English or Urdu-script); a mixed-language reply
  gets transliterated and synthesized in one voice, but it can't natively
  speak code-switched audio.
- **Whisper auto-detect** can occasionally misidentify short/ambiguous
  audio as an unrelated language; there's a retry-to-Urdu fallback for
  this, but it isn't foolproof.
- **`scheduled_for` on deployments** is now a hard-required field
  (resolved from natural language or asked for explicitly); this was a
  known unreliable spot before the fix.
- Running locally via ngrok, not yet deployed to a persistent host.

## Project structure

```
backend/
  src/
    agent/          graph.js (agent loop), languageTag.js, memory.js, onboarding.js
    tools/           DB-backed agent tools (incidents, blockers, deployments, etc.)
    services/
      whatsapp/       webhook, media download, message/audio/document sending
      aiservices/     bridge to the Python ai-services
      jira/           Jira issue creation
      opensearch/     commit-log store client
    routes/cron.js    endpoints polled by n8n
    routes/logs.js    endpoint hit by CI on every push
    db/pool.js        Postgres connection
  scripts/logPushedCommits.js  manual/local commit-log ingestion (same path CI uses)
  docker-compose.yml  self-hosted OpenSearch
  schema.sql
  prompts/system_prompt.txt

ai-services/
  main.py              FastAPI app (/transcribe, /speak)
  transcribe.py        Groq Whisper STT
  transliterate.py     language classification + Roman Urdu -> Urdu script
  text_to_speech.py    self-hosted VITS TTS
  correct_transcript.py  deterministic STT correction patterns
```
