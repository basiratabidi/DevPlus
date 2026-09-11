# Deployment Guide

Everything needed to take DevPulse from local/ngrok to a persistent host.

## 0. Current decision: local + ngrok for the demo

Deploying to a persistent host was evaluated and deliberately deferred,
DigitalOcean's student credit turned out unavailable, Oracle Cloud's
card verification failed, and Azure's $100 credit remained unused by
choice: for a scoped live demo, a stable local+ngrok setup is lower-risk
than standing up and hardening a new host this close to the
presentation. Sections 1-6 below are for whenever real deployment is
picked back up; this section covers making the local setup demo-safe.

**The risk with plain `ngrok http 3000`**: the free tier assigns a new
random subdomain every restart (confirmed, current session is
`https://blend-recital-splatter.ngrok-free.dev`, which will be different
next time ngrok is relaunched). Since Meta's webhook Callback URL is a
fixed value you set once in the Meta App dashboard, an ngrok restart
between now and the demo silently breaks inbound messages until someone
notices and re-points it.

**Fix, claim a free static domain** (ngrok's free tier includes one):
1. In the ngrok dashboard (Cloud Edge → Domains), claim a free static
   domain, something like `your-name.ngrok-free.app`.
2. Start the tunnel with `ngrok http --domain=your-name.ngrok-free.app 3000`
   instead of the plain `ngrok http 3000`.
3. Set Meta's webhook Callback URL to that fixed domain **once**, it
   then survives every ngrok/backend restart between now and the demo.

**Pre-demo checklist (run this the morning of, and once the night
before):**
```bash
curl -s http://127.0.0.1:4040/api/tunnels | python3 -c \
  "import json,sys; print(json.load(sys.stdin)['tunnels'][0]['public_url'])"
# Confirm this matches the Callback URL in Meta App dashboard -> WhatsApp -> Configuration
curl -s https://<that-url>/health   # should return "ok"
```

## 1. Server requirements

- **Docker + Docker Compose** (for `ai-services` and `n8n`)
- **Node.js 20+** (for the backend, or run it in Docker too, see below)
- **Minimum 2 vCPU / 4GB RAM.** The Python `ai-services` container loads
  real ML models at startup (Whisper is called via Groq's API, not
  local, but the TTS VITS models, `facebook/mms-tts-eng` and
  `-urd-script_arabic`, load locally and need real RAM). 1GB-class
  instances (e.g. AWS/GCP free-tier micro instances) are **not** enough
  and will likely OOM.
- **A public domain with HTTPS.** Meta's WhatsApp Cloud API requires an
  HTTPS webhook URL, plain HTTP or a bare IP won't work. If using
  Dokploy, it provisions Let's Encrypt certs automatically; otherwise set
  up your own reverse proxy (Caddy/nginx/Traefik).
- **Do NOT deploy the `urdu-llm` service** defined in
  `ai-services/docker-compose.yml`, it's leftover from an experiment
  that was reverted (measured ~2.4 tokens/sec on CPU, unusably slow; see
  `transliterate.py`'s comments). It needs a 4.6GB model file and would
  waste RAM/disk for no benefit. Either delete that service block or
  just never run `docker compose up urdu-llm`.

## 2. Database

Already external (Neon Postgres), no server-side DB setup needed beyond
having the connection string. If starting fresh:
```bash
psql "$DATABASE_URL" -f backend/schema.sql
```

## 3. Environment variables

### `backend/.env` (required)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (pooled) |
| `DATABASE_URL_UNPOOLED` | Direct (non-pooled) connection, used where needed |
| `GROQ_API_KEY` | Powers the agent LLM |
| `GROQ_MODEL` | e.g. `openai/gpt-oss-120b` |
| `WHATSAPP_PHONE_NUMBER_ID` | From Meta App dashboard → WhatsApp → API Setup |
| `WHATSAPP_ACCESS_TOKEN` | Permanent System User token (not the 24h temp token) |
| `WHATSAPP_VERIFY_TOKEN` | Any string you choose, must match what you enter in Meta's webhook config |
| `WHATSAPP_APP_SECRET` | From Meta App dashboard → Settings → Basic, used for webhook signature verification |
| `CRON_SECRET` | Any random string, shared between backend and n8n |
| `AI_SERVICE_URL` | URL the backend uses to reach `ai-services` (e.g. `http://ai-services:8001` if both are on the same Docker network, or a public URL if separate hosts) |
| `PORT` | Backend's listen port (3000) |
| `OPENSEARCH_URL` | Where the self-hosted OpenSearch instance listens (e.g. `http://localhost:9200`) - see §4a. |
| `LOG_INGEST_SECRET` | Shared secret CI uses to authenticate commit-log ingestion, same pattern as `CRON_SECRET`. |

### `backend/.env` (optional)
| Variable | Purpose |
|---|---|
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` | Jira auto-issue-creation. Unset = feature no-ops cleanly, everything else still works. |
| `JIRA_INCIDENT_ISSUE_TYPE`, `JIRA_BLOCKER_ISSUE_TYPE` | Must match issue type names that actually exist in your Jira project (check via Jira's "Create issue" dropdown, defaults of "Bug"/"Task" are NOT guaranteed to exist, confirmed this broke on a real project during testing) |

### `backend/.env` (not used, safe to omit)
`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`,
leftover from an earlier design that used Evolution API; the project now
uses Meta's Cloud API directly and never reads these.

### `ai-services/.env`
| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Used for Whisper STT and the Roman Urdu → Urdu script transliteration LLM call |

## 4. Deploy sequence

1. **ai-services**: `cd ai-services && docker compose up -d ai-services` (explicitly name the service to skip `urdu-llm`)
2. **OpenSearch**: `cd backend && docker compose up -d opensearch` - see §4a for what this is for
3. **n8n**: `cd backend/n8n && docker compose up -d`
4. **Backend**: either `npm install && npm run dev` directly on the host, or containerize it (no existing Dockerfile for it yet, would need to be added if you want it in Docker too)
5. **Import n8n workflows**: the 3 JSON files in `backend/n8n/` (reminders, missed-checkins, stale-blockers), import via n8n's UI, then activate each
6. **Point Meta's webhook at your real domain**: Meta App dashboard → WhatsApp → Configuration → Webhook → set Callback URL to `https://yourdomain.com/webhook/whatsapp`, Verify Token to your `WHATSAPP_VERIFY_TOKEN` value, subscribe to the `messages` field

## 4a. Automatic project-activity logging (OpenSearch + CI)

Per the project's advisor feedback: activity logging shouldn't only
depend on a developer manually reporting things over WhatsApp - the
system should also be able to inspect the project's own codebase and
log that automatically. Implementation:

- **Store**: self-hosted [OpenSearch](https://opensearch.org/) (the
  Apache-2.0-licensed, actually-open-source fork of the Elasticsearch
  stack - Elasticsearch itself moved to a source-available license in
  2021). Runs via `backend/docker-compose.yml`. Security plugin is
  disabled for local/demo use (`plugins.security.disabled=true`) - never
  do this on a real internet-facing instance.
- **Trigger**: the `log-commit-activity` job in
  `.github/workflows/ci.yml` fires on every push, builds a payload from
  GitHub's own push-event commit data (no git history access needed in
  the runner), and POSTs it to the backend.
- **Ingestion**: `POST /logs/ingest-commits` (`routes/logs.js`), secret
  -authenticated the same way `/cron/*` is, indexes each commit into
  OpenSearch.
- **Reading it back**: the agent's `queryProjectActivity` tool
  (`tools/projectActivityTool.js`) lets a user ask "what's changed in
  the codebase recently?" and get a real, commit-backed answer.

**To wire up the CI side**, add two repository secrets (GitHub repo →
Settings → Secrets and variables → Actions):
| Secret | Value |
|---|---|
| `BACKEND_URL` | Your backend's public URL (the static ngrok domain from §0, or a real deployed host) |
| `LOG_INGEST_SECRET` | Must match `LOG_INGEST_SECRET` in `backend/.env` |

Until both secrets are set, the CI job logs what it *would* have sent
and exits cleanly rather than failing the build (`continue-on-error` is
also set as a second layer of protection - this must never be able to
break CI, matching the project's established best-effort pattern for
external integrations like Jira).

## 5. Post-deploy verification

```bash
curl https://yourdomain.com/health                    # backend up
curl https://your-ai-services-host:8001/docs           # ai-services up
```
Then send a real WhatsApp text message and a voice note to the business
number, and confirm both get replies.

## 6. Known gotchas (found during development, worth knowing before you deploy)

- **`.env` files are not hot-reloaded.** Editing them requires restarting
  the process (`npm run dev` restart for backend; the ai-services
  container auto-reloads code changes via `uvicorn --reload`, but env
  var changes still need a container restart: `docker compose restart
  ai-services`).
- **Groq's free tier has a 200,000 tokens/day cap** on the agent model,
  separate from the per-minute limit. A busy demo day can exhaust it.
  Consider Groq's paid Dev Tier if this is a real risk for your event.
- **`WHATSAPP_PHONE_NUMBER_ID` must be a single contiguous number**, a
  stray space or line break silently breaks every outbound message
  (this happened once during development from a copy-paste issue).
- The **`urdu-llm` service must stay off** in production (see §1).
- **OpenSearch 2.12+ requires `OPENSEARCH_INITIAL_ADMIN_PASSWORD`** at
  container startup even when `plugins.security.disabled=true` is also
  set - the security-demo installer checks for the password before the
  disable flag takes effect, and the container exits immediately without
  it (found the first time OpenSearch was started for this project).
  Already set in `backend/docker-compose.yml`; only matters if you
  recreate that file from scratch.
