# DevPulse — Project Status
*As of September 2, 2026 — 25 days to presentation (Sept 27)*

## What DevPulse is

An agentic WhatsApp assistant for an engineering team's daily ops: team members log status updates, report incidents/blockers, track deployments, and get automated reminders and severity-based escalation — all conversationally, via text or voice, in English or Urdu/Roman Urdu. Same architectural pattern as the GlucoWhats FYP (WhatsApp → LLM agent → controlled tools → PostgreSQL), applied to a different case study so it's safe to use as a standalone internship/CV project.

---

## ✅ Built and confirmed working

### Data layer
- PostgreSQL on Neon, full schema applied (users, profiles, incidents, task_logs, deployments, blockers, reminders, escalation_contacts, escalation_events)
- All core tools tested directly against the DB (`testTools.js`)

### Agent
- Groq-based tool-calling agent (`openai/gpt-oss-120b`), system prompt in separate file (`prompts/system_prompt.txt`)
- Conversation memory (last 15 messages, in-process)
- "restart" command clears memory
- Tool-call schema hardened against `null` value validation errors
- Tool-name alias fallback (handles model near-misses like `logBlocker` → `reportBlocker`)

### WhatsApp integration (Meta Cloud API — official, not Evolution API)
- Meta Developer App created (DevPlus), separate from FYP's business account
- Webhook GET verification + POST signature validation (HMAC-SHA256) working
- App correctly subscribed to WABA webhook events (fixed a real bug where the WABA was pointed at Meta's internal test app instead of ours)
- Text messages: full round trip confirmed (send → agent → tool → DB → reply)
- Tested and confirmed tool routes: task log, P1 incident (with escalation prompt), deployment
- ngrok tunnel for local dev exposure

### Voice (both directions)
- **Voice-in:** WhatsApp voice note → Meta media download → Groq Whisper (`whisper-large-v3`, language forced to `ur`) → transcript. Confirmed working for English and Urdu/Roman Urdu.
- **STT accuracy fix:** regex safety net corrects Whisper's B1/V1/D1/T1 → P1/P2/P3/P4 confusions (deterministic, not model-dependent)
- **Language detection + transliteration:** Groq LLM classifies English vs Urdu-script vs Roman Urdu, and transliterates Roman Urdu → proper Urdu script before TTS (confirmed accurate on real test phrase)
- **Voice-out:** reply text → `gtts` (Google Translate TTS, free, native Node) → WhatsApp voice note. Confirmed working in both English and Urdu.
- Reply modality matches input modality (voice in → voice out, text in → text out), with automatic fallback to text if TTS fails

### Reports
- PDF activity report generation (`pdfkit`) — task logs, incidents, blockers, deployments
- Sent directly as a WhatsApp document via Meta's media upload + document-message flow
- Triggered by "what happened this week?" style queries

### Infrastructure
- Permanent System User access token (no more 24h expiry interruptions)
- `.env`-based config, `.gitignore` awareness
- Cron routes scaffolded with secret-header auth (`/cron/reminders`, `/cron/missed-checkins`, `/cron/stale-blockers`)

---

## ⚠️ Built but not yet tested

- **Cron endpoints** — code exists (`src/routes/cron.js`), `CRON_SECRET` just set to a real value, curl tests were in progress when this doc was written
- **Blocker tool via WhatsApp** — code confirmed correct (duplicate-declaration bug fixed), but no live WhatsApp test recorded yet
- **`listOpenBlockers` / `listUpcomingDeployments`** query tools — written, DB-tested earlier, not yet tested via live agent conversation

## ❌ Not started

- **n8n workflows** — three JSON workflow files were drafted early on but never actually imported or run; n8n itself may not be installed/running yet
- **Profile/onboarding flow via WhatsApp** — `profileTool.js` exists (createUser, upsertProfile, addEscalationContact) but there's no conversational onboarding path for a *new* team member; users have only been added directly via SQL/script so far
- **Escalation contact testing** — `evaluateEscalation` code path exists and was exercised once (P1 incident), but whether it actually *notifies* a real escalation contact number hasn't been confirmed (may return `notified: false` if no contact is set for the test user)
- **Multi-user testing** — everything so far has been tested as a single user (you); haven't confirmed behavior with 2+ distinct WhatsApp numbers interacting concurrently
- **Deployment to a VPS** — currently running on your local machine via ngrok tunnel; not yet deployed anywhere persistent (ngrok URLs are also not stable across restarts, which matters for a live demo)
- **Credential rotation** — Groq API key, WhatsApp access token, and App Secret have all been pasted in plaintext during this session and should be rotated before the real demo
- **Presentation materials** — no architecture diagram, no demo script, no slides yet

---

## Recommended order for remaining 25 days

1. **This week:** finish cron endpoint testing → stand up n8n → wire the 3 scheduled workflows → test blocker route live
2. **Next:** conversational onboarding (so a "new team member" can register themselves, which will matter for a multi-person demo) + escalation contact confirmation
3. **Mid-point:** decide on and execute VPS deployment (or explicitly plan to demo locally with ngrok — either is fine, but should be a decision, not a default)
4. **Final week:** credential rotation, architecture diagram, demo script, rehearsal
5. **Explicitly descoped for now** (revisit only if time remains): swapping `gtts` for a higher-quality Urdu TTS model (e.g. Meta MMS) — current voice quality is "robotic but correct," which is an honest, defensible tradeoff to state in the presentation

---

## Known honest caveats to mention in your viva/presentation
- Voice-out uses Google's TTS engine (via `gtts`), not a neural model — functional, not natural-sounding; framed as a deliberate reliability-over-polish tradeoff
- Roman Urdu handling relies on a general-purpose LLM for transliteration (Groq), not a model fine-tuned for the task — good but not perfect on rare/ambiguous words
- Currently running on a local machine + ngrok tunnel, not a persistent server — fine for a scoped demo, would need real deployment for production use
- WhatsApp Cloud API test number is capped at 5 verified recipients — sufficient for a demo, not for a real team rollout without completing Meta's production number setup
