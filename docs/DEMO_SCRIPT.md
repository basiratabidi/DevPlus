# Demo Script

~8-10 minutes, five short flows. Each one demonstrates a specific,
previously-broken-then-fixed capability — lead with that framing rather
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
loop — the LLM decides which tool to call, not a fixed command syntax.

## 2. Urdu voice note (~2 min)

Send a voice note in Roman or Urdu-script Urdu describing an incident
without stating severity, e.g. *"mera deployment production mein fail ho
gaya"*.

**Expect**: the agent asks for severity **in Urdu**, e.g. something like
*"Is issue ki severity kya hai - P1, P2, P3, ya P4?"*, and the reply
comes back as a **voice note**, not text.

Say while waiting: the language decision here is deterministic, not
LLM-guessed — a rule-based classifier (`languageTag.js`) tags the
transcript before the agent ever sees it, because pure LLM language
inference was measured non-deterministic even at temperature 0. This is
worth stating explicitly — it's a design decision made *because of* a
real, reproduced failure, not a default choice.

## 3. Duplicate-incident detection (~2 min)

Send: re-report the *same* incident from step 1 in different words,
e.g. *"CDN is still showing old cached files"*.

**Expect**: agent asks *"is this the same incident as X, or a new
one?"* — **and no new database row is created on this turn** (this
was a real bug: the write used to fire before the user answered).

Reply: *"yes same one"*

**Expect**: `updateIncidentTiming` runs, the existing incident's
timestamp refreshes, no duplicate row. (TC ref: INC-02/INC-03)

Say while waiting: this uses a per-user confirmation-state machine
(`pendingDupConfirmation` in `graph.js`) specifically so the write can
only happen on the turn that actually answers the question.

## 4. Jira mirroring (~1-2 min)

From step 1's incident (or a fresh one), open Jira in a second window/
tab beforehand, then point out the issue that was auto-created — pull up
the actual issue by the key mentioned in the agent's reply.

**Expect**: the agent's confirmation reply mentions a Jira key like
`(Jira: SCRUM-6)`, and that issue is real and visible in Jira Cloud.
(TC ref: INC-06 — real issues SCRUM-6/7/8/11/12 were created and
verified during testing)

Say while waiting: this is deliberately best-effort — wrapped so a Jira
outage or misconfiguration never blocks the underlying incident record
(TC ref: RES-03).

## 5. P1 escalation (~1-2 min)

Send: *"prod is completely down, this is a P1"*

**Expect**: immediate escalation fires — if the live-notify checklist
(`docs/LIVE_TEST_CHECKLIST.md`) has been run beforehand, a second phone
visibly receives the escalation WhatsApp message live during the demo.
(TC ref: INC-05)

---

## Closing talking points (viva-style Q&A prep)

Pull directly from `docs/DevPulse-Status.md`'s "Known honest caveats"
section — state the caveats yourself before being asked; it reads as
more credible than waiting to be caught on them. In particular:
Groq's free-tier daily cap was hit more than once during real testing
(have a concrete number/date ready if asked), and deployment is
currently local+ngrok by deliberate choice, not an oversight — be ready
to explain the tradeoff (`docs/DEPLOYMENT.md` section 0) if asked why
it isn't on a public server.
