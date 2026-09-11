# Test Documentation

Test cases and results for DevPulse, compiled from actual test runs
during development (not hypothetical/planned tests — every "Pass" below
was actually executed and observed, either via direct function calls,
the real HTTP API, or live WhatsApp messages).

**Legend**: 🟢 Pass · 🟡 Partial/needs follow-up · ⚪ Not yet tested ·
Method: `Live WA` = real WhatsApp round-trip · `Direct` = called the
function/endpoint directly, bypassing the UI · `Agent` = via `runAgent()`
programmatically

---

## 1. Webhook & Authentication

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| WH-01 | Webhook GET verification, correct token | `hub.mode=subscribe&hub.verify_token=<real>&hub.challenge=X` | 200, echoes challenge | 🟢 Pass | Direct |
| WH-02 | Webhook GET verification, wrong token | wrong `hub.verify_token` | 403 | 🟢 Pass | Direct |
| WH-03 | Webhook POST, invalid signature | bad `x-hub-signature-256` | 401 | 🟢 Pass | Direct |
| WH-04 | Webhook dedup | same `message.id` delivered twice (Meta retry behavior) | second delivery ignored | 🟢 Pass | Live WA (observed in logs during voice testing) |
| CR-01 | Cron route, no secret | POST `/cron/reminders`, no header | 401 | 🟢 Pass | Direct |
| CR-02 | Cron route, correct secret | POST with `x-cron-secret` | 200 | 🟢 Pass | Direct |

## 2. Core logging — task updates

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| TL-01 | Plain task log | "wrote unit tests for the notification service" | Task row created, confirmation reply | 🟢 Pass | Agent |

## 3. Incidents

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| INC-01 | New distinct incident | "the CDN is serving stale assets, severity P3" | New row created, severity captured | 🟢 Pass | Agent |
| INC-02 | Duplicate detection — turn 1 | Re-report an already-open incident | Agent asks "is this the same one?", **no write yet** | 🟢 Pass (DB-verified: 0 writes on ask turn) | Agent |
| INC-03 | Duplicate detection — turn 2, confirm same | "yes same one" | `updateIncidentTiming` called, `reported_at` bumped, no new row | 🟢 Pass (DB-verified across repeated runs) | Agent |
| INC-04 | Duplicate detection — genuinely new/different | Unrelated new incident after a dup-check | New row created normally, not blocked | 🟢 Pass | Agent |
| INC-05 | P1 triggers escalation | severity=P1 | `evaluateEscalation` fires, team lead notified | 🟢 Pass | Agent (confirmed via `escalation_events` rows) |
| INC-06 | Jira issue auto-created | New incident reported | Jira issue created, `jira_issue_key` saved, mentioned in reply | 🟢 Pass — created real issues (SCRUM-6, SCRUM-8, SCRUM-11) against a live Jira project | Agent + Direct API |
| INC-07 | Jira issue type mismatch handling | Project has no "Bug" type | Falls back safely once `JIRA_INCIDENT_ISSUE_TYPE` set to a valid type | 🟢 Pass (found the real mismatch, fixed, verified) | Direct API |

## 4. Blockers

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| BLK-01 | New distinct blocker | "blocked on getting a signed NDA..." | New row created | 🟢 Pass | Agent |
| BLK-02 | Duplicate detection, ask → confirm | Same pattern as INC-02/03 | Timing updated, no duplicate | 🟢 Pass (DB-verified) | Agent |
| BLK-03 | High-severity immediate escalation | severity=high | Escalated immediately, not waiting for sweep | 🟢 Pass | Agent |
| BLK-04 | Jira issue auto-created | New blocker reported | Jira issue created and linked | 🟢 Pass (SCRUM-7, SCRUM-12) | Agent |

## 5. Deployments

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| DEP-01 | Clear date given | "deploying X to production tomorrow at 3pm" | Real ISO date resolved and stored | 🟢 Pass | Agent |
| DEP-02 | No date given | "deploy the auth service to staging" (no timing) | Agent asks a follow-up question, does NOT log with a null/guessed date | 🟢 Pass — this was a known pre-existing bug, confirmed fixed | Agent |
| DEP-03 | Already happened, no specific time | "I already deployed X, it went well" | Uses current date/time automatically, no unnecessary question | 🟢 Pass | Agent |

## 6. Cron / scheduled sweeps

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| SWP-01 | Reminders sweep, due reminder | Real due, unsent reminder row | WhatsApp message sent, marked sent | 🟢 Pass (real message delivered) | Live WA |
| SWP-02 | Reminders sweep, idempotency | Re-run sweep after SWP-01 | 0 sent (already-sent reminders excluded) | 🟢 Pass | Direct |
| SWP-03 | Stale-blocker escalation | Blocker past threshold | Escalated once | 🟢 Pass | Direct |
| SWP-04 | Stale-blocker de-dup guard | Same sweep run 3x in a row | Escalates exactly once, then no-ops | 🟢 Pass — this was a real bug found and fixed (would have spammed every 6h) | Direct |
| SWP-05 | Missed-checkin de-dup guard | Same sweep run 3x in a row | Notifies once, then no-ops until next day | 🟢 Pass — same bug class as SWP-04, fixed | Direct |
| SWP-06 | Blocker timing update re-arms escalation | `updateBlockerTiming` after a prior escalation | `escalated_at` reset, eligible to re-escalate after another full threshold | 🟢 Pass | Direct |

## 7. PDF reports

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| PDF-01 | Blockers PDF | "show my blockers" | PDF generated, sent as WhatsApp document | 🟢 Pass | Agent + Direct |
| PDF-02 | History/activity PDF | "what happened this week" | PDF generated, sent as WhatsApp document | 🟢 Pass | Agent + Direct |
| PDF-03 | Missing tool bug (`sendBlockersPdf`) | System prompt referenced a tool that didn't exist | Caused silent crashes / hallucinated success claims | 🟢 Fixed — tool implemented, retested, no recurrence | Agent |

## 8. Voice pipeline — STT

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| STT-01 | `language="ur"` forced (original config) | English speech, Pakistani accent | Accurate English transcript | 🔴 **Failed** — Whisper phonetically transliterated English into Urdu script | Live WA |
| STT-02 | Auto-detect (no forced language) | Urdu speech ("yeh eik naya error hai") | Accurate Urdu transcript | 🔴 **Failed** — misidentified as Turkish entirely | Live WA |
| STT-03 | Detect-then-conditional-retry (current) | Various | Correct transcript, retries forced-`ur` only if detection lands outside en/ur | 🟢 Pass — fix verified live (correct auto-detect, e.g. `language=urdu` logged with no retry needed) | Live WA |
| STT-04 | Domain vocabulary correction | "roll back", "data base", "stand up" (STT-split compounds) | Normalized to "rollback"/"database"/"standup" | 🟢 Pass | Direct (unit test) |
| STT-05 | Severity code correction | "B1"/"V1"/"D1"/"T1" mis-hearings | Corrected to "P1" etc. | 🟢 Pass (pre-existing, confirmed still working) | Direct |

## 9. Voice pipeline — language tagging

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| LNG-01 | Pure English classification | "fixed the login bug", adversarial cases with "tab"/"par"/"the" | Classified `english`, not falsely flagged as Urdu | 🟢 Pass — 17/17 unit tests, including a real false-positive bug found and fixed | Direct (unit test) |
| LNG-02 | Pure Urdu classification | Urdu-script input | Classified `urdu` | 🟢 Pass | Direct + Agent |
| LNG-03 | Roman Urdu classification | "Mera deployment complete ho gaya hai" | Classified `urdu` | 🟢 Pass | Agent |
| LNG-04 | Mixed/code-switched classification | "Deployment ho gaya hai lekin production server pe error aa raha hai" | Classified `mixed` | 🟢 Pass | Agent |
| LNG-05 | Tag authority over reply language | English-tagged message with garbled non-English-looking content | Reply stays in tagged language, doesn't pattern-match the garbled text's apparent language | 🟢 Pass — reproduced a real live failure (replied in Turkish despite ENGLISH tag) and confirmed the fix | Agent |
| LNG-06 | Mixed-tag reply style | Mixed-tagged report | Reply is genuinely mixed Roman Urdu/English, not defaulting to pure English | 🟢 Pass — was inconsistent (~1/3 correct) before adding a concrete worked example to the prompt; consistent after | Agent |
| LNG-07 | Duplicate-detection write timing | Ask-then-confirm flow for voice-tagged messages | Write happens only on the real confirmation turn, never the asking turn | 🟢 Pass — found and fixed a real bug where the write happened silently before the user answered | Agent |

## 10. Voice pipeline — TTS

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| TTS-01 | English reply synthesis | Known-English reply | Correct English VITS voice used | 🟢 Pass | Direct |
| TTS-02 | Urdu reply synthesis | Known-Urdu reply | Correct Urdu VITS voice used | 🟢 Pass | Direct |
| TTS-03 | Known-language fast path | `known_lang` passed from input tag | Skips redundant LLM re-classification for unambiguous cases | 🟢 Pass — confirmed via logs for both en/ur | Direct |
| TTS-04 | Embedded English terms in Urdu reply | Reply containing "severity", "P1"-"P4" | Phonetically rendered into Urdu script, not silently dropped | 🔴→🟢 **Found real bug**: Urdu VITS tokenizer silently drops ALL Latin characters (confirmed via direct tokenizer inspection — "severity" and every "P" vanished, 0 tokens for them). Fixed via transliteration prompt extension; re-verified 0 dropped tokens after fix | Direct (tokenizer-level verification) |
| TTS-05 | Content-type correctness | `/speak` response | Declared as `audio/mpeg`, matches actual MP3 bytes | 🟢 Pass — found and fixed a mislabeled `audio/wav` header | Direct |
| TTS-06 | WhatsApp upload MIME type | Audio reply upload to Meta | `audio/mpeg`, accepted by Meta's API | 🟢 Pass — found and fixed a real bug (was `audio/wav`, rejected by Meta) | Live WA |
| TTS-07 | Mixed-language voice quality | Full mixed-language conversation, listened to on a real device | Natural-sounding mixed speech | ⚪ **Not tested** — VITS is single-language per call; a mixed reply is synthesized entirely in one voice after transliteration. Architecturally known, not verified by ear. |

## 11. Resilience / failure handling

| ID | Description | Input | Expected | Result | Method |
|---|---|---|---|---|---|
| RES-01 | Groq API failure mid-turn | Real 429 (daily quota exhausted) during dedup confirmation | Graceful fallback reply, **no duplicate created**, no crash | 🟢 Pass — reproduced with real rate-limit errors, verified DB state stayed correct across repeated failures | Agent (real API failure, not simulated) |
| RES-02 | Voice transcription failure | Malformed/failed STT call | Falls back to a text apology, doesn't crash the webhook | 🟢 Pass (pre-existing, confirmed via code path) | Direct |
| RES-03 | Jira unconfigured | No `JIRA_*` env vars set | Incident/blocker logging proceeds normally, `jira_issue_key` stays null, no delay | 🟢 Pass | Agent |
| RES-04 | Jira misconfigured (stale env after edit) | `.env` corrected but backend process not restarted | Silent `jira_issue_key: null` (soft-fail as designed) — diagnosed as a `.env` hot-reload limitation, not a Jira bug | 🟢 Diagnosed correctly, resolved by restart | Live WA |

---

## Known gaps — explicitly not yet verified

- **STT-03's retry branch** (auto-detect lands outside en/ur → forced retry) has been logically verified and the underlying misdetection bug (STT-02) is fixed, but the retry path itself firing in a real live call hasn't been directly observed yet.
- **TTS-07**: mixed-language audio quality, by ear, on a real device.
- Onboarding flow — not exercised during this test round (Groq-quota-blocked at the time; logically unchanged from prior testing).
- Multi-user concurrency — all testing has been single-user.
- **Partially closed**: `backend/test/` now holds an automated `node:test` suite (26 cases, run via `npm test` and in CI's `backend-unit-tests` job) covering the two pure, DB-free units — `languageTag.js` (TC-LNG-01 through TC-LNG-08 from `docs/TEST_CASES.md`) and `graph.js`'s `describeToolResult`. Everything that touches the database, WhatsApp, Groq, or Jira is still verified only by direct execution / live WhatsApp testing, not by the automated suite — those integrations would need mocking or a test database to cover, which hasn't been built yet.
