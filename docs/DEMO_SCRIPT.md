# Demo Script

~12-14 minutes, seven short flows (the seventh is optional, cut it if
short on time). Each one demonstrates a specific,
previously-broken-then-fixed capability, lead with that framing rather
than presenting them as if they always just worked, since "found a real
bug, reproduced it, fixed it, reverified" is a stronger FYP story than
"it worked first try." Every message below is drawn from an actual
verified test case in `docs/TESTING.md` (cited inline), not invented.

Pre-demo: run the checklist in `docs/DEPLOYMENT.md` section 0 (confirm
the ngrok URL matches Meta's webhook config, confirm `/health` returns
ok).

---

## 1. Plain text logging (baseline, ~1 min)

Send: *"the CDN is serving stale assets, severity P3"*

**Expect**: incident logged, severity P3 captured. (TC ref: INC-01)

Say while waiting: this goes through a bounded multi-round tool-calling
loop, the LLM decides which tool to call, not a fixed command syntax.

## 2. Urdu voice note (~2 min)

Send a voice note in Roman or Urdu-script Urdu describing an incident
without stating severity, e.g. *"mera deployment production mein fail ho
gaya"*.

**Expect**: the agent asks for severity **in Urdu**, e.g. something like
*"Is issue ki severity kya hai - P1, P2, P3, ya P4?"*, and the reply
comes back as a **voice note**, not text.

Say while waiting: the language decision here is deterministic, not
LLM-guessed, a rule-based classifier (`languageTag.js`) tags the
transcript before the agent ever sees it, because pure LLM language
inference was measured non-deterministic even at temperature 0. This is
worth stating explicitly, it's a design decision made *because of* a
real, reproduced failure, not a default choice.

## 3. Duplicate-incident detection (~2 min)

Send: re-report the *same* incident from step 1 in different words,
e.g. *"CDN is still showing old cached files"*.

**Expect**: agent asks *"is this the same incident as X, or a new
one?"*, **and no new database row is created on this turn** (this
was a real bug: the write used to fire before the user answered).

Reply: *"yes same one"*

**Expect**: `updateIncidentTiming` runs, the existing incident's
timestamp refreshes, no duplicate row. (TC ref: INC-02/INC-03)

Say while waiting: this uses a per-user confirmation-state machine
(`pendingDupConfirmation` in `graph.js`) specifically so the write can
only happen on the turn that actually answers the question.

## 4. Jira mirroring (~1-2 min)

From step 1's incident (or a fresh one), open Jira in a second window/
tab beforehand, then point out the issue that was auto-created, pull up
the actual issue by the key mentioned in the agent's reply.

**Expect**: the agent's confirmation reply mentions a Jira key like
`(Jira: SCRUM-6)`, and that issue is real and visible in Jira Cloud.
(TC ref: INC-06, real issues SCRUM-6/7/8/11/12 were created and
verified during testing)

Say while waiting: this is deliberately best-effort, wrapped so a Jira
outage or misconfiguration never blocks the underlying incident record
(TC ref: RES-03).

## 5. P1 escalation (~1-2 min)

Send: *"prod is completely down, this is a P1"*

**Expect**: immediate escalation fires, if the live-notify checklist
(`docs/LIVE_TEST_CHECKLIST.md`) has been run beforehand, a second phone
visibly receives the escalation WhatsApp message live during the demo.
(TC ref: INC-05)

## 6. Automatic project-activity logging (~2 min)

Open `<backend-url>/opensearch-dashboards/` in a browser tab prepared
beforehand, showing the saved "DevPulse Activity" dashboard (commits
over time, webhook hits by type). Alternatively/additionally, the
lighter built-in status page at `<backend-url>/dashboard/`.

**Say while presenting**: this was added per advisor feedback - activity
logging shouldn't depend only on a developer remembering to report it
over WhatsApp. Every real commit gets indexed automatically by CI on
push, and every real WhatsApp message that just came in during this
demo (steps 1-5) is *also* logged the same way, independent of anything
the agent did with it. Point at the webhook-hits count/chart and note
it reflects the actual messages just sent live.

If time allows, send one more message now and refresh the dashboard to
show it update in real time.

## 7. Automatic error intake from a connected project (~1-2 min, optional)

Two ways to show this, pick based on time/prep:

**7a. A genuinely connected project (`ai-services`)**: from a terminal,
trigger a real failure in DevPulse's own AI service, e.g. send it an
invalid audio file:
```bash
curl -X POST <ai-services-url>/transcribe -F "file=@not_real_audio.ogg;type=audio/ogg"
```
This isn't a simulation - `ai-services/error_report.py` reports its
*own real* failure to `/logs/ingest-error`, the exact same path an
external team's project would use (see `docs/CONNECTING_A_PROJECT.md`).
Verified live during development: a real `P2` incident and a real Jira
issue were created from this exact call.

**7b. Simulating an external team's project**, useful if you want to
show a project name other than `ai-services`:
```bash
curl -X POST <backend-url>/logs/ingest-error \
  -H "Content-Type: application/json" \
  -H "x-log-ingest-secret: <LOG_INGEST_SECRET>" \
  -d '{"project":"<real or plausible project name>","level":"critical","message":"...","stack":"..."}'
```
Frame this as: "this is the same call your own CI/CD would make -
`docs/CONNECTING_A_PROJECT.md` has a drop-in GitHub Actions job so a
connected team doesn't even need to change app code, just add one job
that fires `if: failure()`, mirroring how DevPulse already reports its
own commits via CI (`log-commit-activity`)."

**Expect** (either path): a real incident appears (check the dashboard
or ask the agent "any recent errors?"), a real escalation WhatsApp
message fires (same pipeline as step 5's P1), and a real Jira issue gets
created (same pipeline as step 4).

Say while waiting: this reuses `reportIncident`/`reportBlocker`
directly - there's no separate "auto-escalation" logic to keep in sync
with the human-reported path, an auto-detected P1 behaves identically to
one a person typed into WhatsApp. Attribute the record to the dedicated
`system-monitoring` account visible in the response, so it's clear this
was never claimed to come from a real team member.

---

## Closing talking points (viva-style Q&A prep)

Pull directly from `docs/DevPulse-Status.md`'s "Known honest caveats"
section, state the caveats yourself before being asked; it reads as
more credible than waiting to be caught on them. In particular:
Groq's free-tier daily cap was hit more than once during real testing
(have a concrete number/date ready if asked), and deployment is
currently local+ngrok by deliberate choice, not an oversight, be ready
to explain the tradeoff (`docs/DEPLOYMENT.md` section 0) if asked why
it isn't on a public server.
