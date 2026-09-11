# Project Proposal: DevPulse

## 1. Title
**DevPulse: An Agentic WhatsApp Assistant for Engineering Team Operations**

## 2. Introduction

Engineering teams routinely fragment their daily operational communication
across multiple tools: Slack for chat, Jira for issue tracking, standups
for status updates, and various dashboards for deployment/incident
visibility. This fragmentation costs time and creates friction, especially
for distributed or fast-moving teams where a quick status update or
incident report should not require opening a dedicated tool.

DevPulse addresses this by moving the entire interaction surface into
WhatsApp, an application every team member already has open, and using
a large language model (LLM) as a conversational front-end to structured,
auditable backend operations (a PostgreSQL database and, optionally, an
external issue tracker).

## 3. Problem Statement

Team members lose time and context switching between multiple tools
(Slack, Jira, dashboards) to perform simple, frequent operational tasks:
logging a status update, reporting an incident or blocker, or tracking a
deployment. These tools also assume a fixed input format (forms, slash
commands), which does not accommodate natural, conversational reporting,
particularly for teams where some members are more comfortable
communicating in Urdu or Roman Urdu than in formal written English.

## 4. Objectives

1. Allow team members to log task updates, incidents, blockers, and
   deployments conversationally via WhatsApp, in natural language, without
   a rigid command syntax.
2. Support both text and voice input, in English, Urdu, and Roman Urdu
   (including code-switched/mixed speech), with the assistant responding
   in the same language/style.
3. Automatically detect and prevent duplicate incident/blocker reports for
   the same underlying issue.
4. Provide automated, time-based reminders and severity-based escalation
   to a configured contact without manual monitoring.
5. Integrate with an external issue tracker (Jira) so operational data
   captured conversationally is also visible in tools the wider
   organization already uses.
6. Generate on-demand PDF activity reports and blocker summaries.
7. Log project activity automatically from the codebase itself (commits,
   via CI), so activity records don't depend entirely on a developer
   remembering to report them.
8. Accept automatic error intake from a team's own connected external
   project, so a genuine production error can be logged, escalated, and
   mirrored to Jira without a person having to type it into WhatsApp.

## 5. Scope

**In scope**: conversational logging of task updates, incidents,
blockers, and deployments; voice and text input in three
language/script variants; duplicate detection; standup and deployment
reminders; severity-based escalation; Jira issue creation; PDF report
generation; new-user onboarding via WhatsApp.

**Out of scope** (for this phase): multi-tenant/multi-organization
support; a web dashboard (WhatsApp is the only interface); two-way Jira
sync (Jira issue updates are not currently reflected back into DevPulse);
support for messaging platforms other than WhatsApp.

## 6. Methodology

The system follows an agentic architecture: inbound messages (text or
transcribed voice) are passed to an LLM-driven tool-calling agent, which
selects and invokes one or more backend tools (database writes, PDF
generation, external API calls) based on the conversation, then composes
a natural-language reply. This differs from a traditional rule-based
chatbot in that the LLM interprets free-form input directly, with
deterministic guards (duplicate-detection gating, language tagging,
required-field validation) layered around it to constrain behavior where
LLM judgment alone proved unreliable during development.

Development proceeded iteratively: each subsystem (agent core, voice
pipeline, cron/escalation, Jira integration) was built, then tested
against real usage (including live WhatsApp round-trips) to surface and
fix issues that only appear under real conditions: several real defects
were found and fixed this way (see `TESTING.md` in this folder), rather
than assumed away. An automated test suite and CI pipeline (see the
Tools and Technologies table) were added later in development to guard
against regressions on the parts of the system that are deterministic
enough to test automatically.

## 7. Tools and Technologies

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Agent LLM | Groq (`openai/gpt-oss-120b`) |
| Speech-to-text | Groq Whisper (`whisper-large-v3`) |
| Text-to-speech | Self-hosted Meta MMS/VITS models |
| Database | PostgreSQL (Neon, serverless) |
| Messaging | Meta WhatsApp Cloud API v25.0 |
| Scheduling | n8n (cron-based sweeps) |
| Issue tracking | Jira Cloud REST API |
| AI microservice | Python, FastAPI |
| Containerization | Docker / Docker Compose |
| CI/CD | GitHub Actions (syntax checks, Docker build check, backend boot/health check, and the automated unit test suite, run on every push) |
| Testing | Node's built-in `node:test` runner (26 automated cases covering the deterministic language classifier and agent confirmation logic) |
| Automatic activity logging | OpenSearch + OpenSearch Dashboards (self-hosted, Apache 2.0), commits and webhook activity indexed automatically, not manually reported by a developer, and browsable visually (Discover, Visualize, saved Dashboards) |
| Automatic error intake | Connected external projects POST real errors directly, auto-escalated and auto-mirrored to Jira through the same pipeline a human report would use |

## 8. Expected Outcomes

A working, tested WhatsApp assistant that a small engineering team could
realistically adopt for daily operational logging, demonstrated via a
live demo covering English, Urdu, and Roman Urdu voice and text
interactions, duplicate-report handling, automated escalation, and Jira
issue creation.

## 9. Known Limitations (disclosed upfront)

- Currently demonstrated on a single-user/small-team basis; multi-user
  concurrency has not been extensively tested.
- Voice quality for mixed-language replies is constrained by the
  underlying TTS models being single-language per call.
- Depends on Groq's hosted API for LLM/STT, which is subject to
  free-tier rate limits.
