# Software Requirements Specification (SRS)
## DevPulse — Agentic WhatsApp Assistant for Engineering Team Operations

Format follows IEEE 830 conventions.

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements
for DevPulse, a WhatsApp-based conversational assistant for engineering
team operational logging. It is intended for the project supervisor,
evaluators, and future maintainers.

### 1.2 Scope
DevPulse allows engineering team members to log task updates, incidents,
blockers, and deployments via WhatsApp (text or voice, in English, Urdu,
or Roman Urdu), receive automated reminders and escalations, generate
PDF activity reports, and have qualifying reports automatically mirrored
to Jira as issues.

### 1.3 Definitions, Acronyms, Abbreviations
| Term | Meaning |
|---|---|
| Agent | The LLM-driven tool-calling component that interprets user messages and invokes backend tools |
| Tool | A discrete backend function the agent can invoke (e.g. `reportIncident`, `logDeployment`) |
| STT / TTS | Speech-to-text / text-to-speech |
| Dedup | Duplicate detection (for incidents/blockers) |
| P1-P4 | Incident severity levels: P1 = critical/down, P2 = major, P3 = minor, P4 = cosmetic |
| Sweep | A scheduled, time-based batch job (reminders, missed-checkin, stale-blocker checks) |

### 1.4 References
- IEEE 830-1998, Recommended Practice for Software Requirements Specifications
- Meta WhatsApp Cloud API documentation (v25.0)
- Jira Cloud REST API v3 documentation

### 1.5 Overview
Section 2 describes the product at a high level; Section 3 lists
detailed functional and non-functional requirements.

---

## 2. Overall Description

### 2.1 Product Perspective
DevPulse is a new, standalone system. It integrates with three external
services it does not own: Meta's WhatsApp Cloud API (messaging
transport), Groq's hosted LLM/Whisper API (language understanding and
transcription), and Jira Cloud (optional issue mirroring). It owns its
own PostgreSQL data store.

### 2.2 Product Functions (summary)
- Conversational logging of task updates, incidents, blockers, deployments
- Voice and text input, three language/script variants
- Duplicate incident/blocker detection
- Time-based reminders and severity-based escalation
- PDF report generation
- Jira issue auto-creation
- New-user onboarding

### 2.3 User Classes and Characteristics
| Class | Description |
|---|---|
| Team member | Reports status/incidents/blockers/deployments, receives reminders |
| Team lead / on-call | Receives escalation notifications for high-severity events |
| Administrator | Configures environment, credentials, Jira project mapping |

### 2.4 Operating Environment
Node.js 20+ backend, Python 3.12 (FastAPI) AI microservice running in
Docker, PostgreSQL (Neon), n8n for scheduling, deployed behind an
HTTPS-capable host (WhatsApp Cloud API requires HTTPS webhooks).

### 2.5 Design and Implementation Constraints
- Must operate entirely through WhatsApp as the user-facing interface —
  no separate app or web UI.
- LLM and STT calls depend on Groq's hosted API and its rate limits
  (documented: 200,000 tokens/day on the free tier).
- Self-hosted TTS models are constrained to CPU inference in the current
  deployment target; large local LLMs were evaluated and found too slow
  (~2.4 tokens/sec) on that hardware, informing the decision to keep
  STT/agent reasoning on Groq's hosted API rather than self-host them.

### 2.6 Assumptions and Dependencies
- Users have an active WhatsApp account and the business number is
  registered/approved by Meta for the required message types.
- A valid Groq API key and (optionally) Jira credentials are available.
- The database schema (`schema.sql`) is applied before first use.

---

## 3. Specific Requirements

### 3.1 Functional Requirements

**FR-1 Task logging.** The system shall accept a natural-language
message describing completed work and record it as a task log entry
associated with the reporting user.

**FR-2 Incident reporting.** The system shall accept a natural-language
report of a broken/failing/down system, prompt for severity (P1-P4) if
not stated, and record it as an incident.

**FR-3 Blocker reporting.** The system shall accept a natural-language
report of something blocking the user's progress and record it as a
blocker with a severity (low/medium/high).

**FR-4 Deployment logging.** The system shall accept a natural-language
deployment report, requiring a resolvable scheduled/completed date-time;
if no usable date/time can be inferred, the system shall ask the user
for one rather than logging an incomplete or guessed record.

**FR-5 Duplicate detection.** Before creating a new incident or blocker,
the system shall check the user's existing open incidents/blockers for a
plausible match by meaning (not exact text) and, if found, ask the user
to confirm whether it is the same issue before either updating the
existing record's timestamp or creating a new one.

**FR-6 Voice input.** The system shall accept WhatsApp voice notes,
transcribe them via speech-to-text, and process the transcript through
the same logging pipeline as typed text.

**FR-7 Multilingual support.** The system shall correctly interpret and
respond to input in English, Urdu (Arabic script), and Roman Urdu
(Latin-script transliteration of Urdu), including messages that mix
English technical vocabulary into Urdu sentences, matching the input's
language/style in its reply.

**FR-8 Voice reply.** For voice-note input, the system shall synthesize
and send a spoken reply in addition to or instead of a text reply.

**FR-9 Reminders.** The system shall send automated reminders (e.g.
standup, deployment-window) at their scheduled time, without re-sending
an already-sent reminder.

**FR-10 Escalation.** The system shall automatically notify a
designated escalation contact when an incident is reported at P1
severity, a blocker is reported at high severity, or a blocker remains
open past a configurable time threshold — without re-notifying for the
same already-escalated event on every subsequent check.

**FR-11 PDF reports.** The system shall generate and deliver, as a
WhatsApp document, a PDF summary of recent activity (on request) and a
PDF list of currently open blockers (on request).

**FR-12 Jira mirroring.** When configured, the system shall
automatically create a corresponding Jira issue when a new incident or
blocker is reported, and record the resulting Jira issue key. This shall
be a non-blocking, best-effort action — a Jira failure shall not prevent
the underlying incident/blocker from being recorded.

**FR-13 Onboarding.** The system shall support a conversational
registration flow for a WhatsApp number not yet associated with a known
user.

**FR-14 Query tools.** The system shall support retrieving a user's
currently open blockers and upcoming scheduled deployments on request.

### 3.2 Non-Functional Requirements

**NFR-1 Reliability.** A failure in a non-essential downstream step
(TTS synthesis, Jira creation, LLM reply-wording generation) shall not
prevent the underlying data from being recorded or cause the request to
crash unhandled.

**NFR-2 Determinism where it matters.** Language classification for
voice input shall be resolved by a deterministic, rule-based classifier
rather than solely by LLM inference, based on the documented finding
that LLM-inferred language was non-deterministic even at temperature 0.

**NFR-3 Idempotency.** Scheduled sweeps (reminders, stale-blocker
escalation, missed-checkin detection) shall not take duplicate action
(re-send, re-escalate) for a condition that was already handled on a
prior run.

**NFR-4 Security.** Inbound webhook requests shall be authenticated via
HMAC signature verification; cron endpoints shall require a shared
secret header.

**NFR-5 Usability.** The system shall not require the user to learn a
command syntax; free-form natural language shall be accepted for all
logging operations.

**NFR-6 Auditability.** All logged records (incidents, blockers,
deployments, task logs) shall be timestamped and persisted in a
queryable relational store.

### 3.3 External Interface Requirements

**EIR-1** WhatsApp Cloud API (Meta) — inbound webhook (text/audio
messages), outbound text/audio/document messages.

**EIR-2** Groq API — chat completions (agent reasoning), audio
transcriptions (STT).

**EIR-3** Jira Cloud REST API v3 — issue creation (optional).

**EIR-4** PostgreSQL (Neon) — primary data store.
