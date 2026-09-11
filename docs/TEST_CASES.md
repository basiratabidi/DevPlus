# Test Case Specification
## DevPulse: Positive and Negative Test Cases

Formal test case specification, organized by module. Each case includes
preconditions, steps, and expected result. Cross-reference: `TESTING.md`
records actual execution results for the cases marked 🟢/🔴 there, this
document is the specification (what *should* be tested), not the log of
what already was.

**Type key**: P = Positive (valid input, happy path) · N = Negative
(invalid input, error condition, edge case)

---

## Module 1: Webhook & Authentication

| TC ID | Type | Title | Precondition | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-WH-01 | P | Valid webhook verification | Backend running, correct `WHATSAPP_VERIFY_TOKEN` set | GET `/webhook/whatsapp` with correct `hub.verify_token` and a `hub.challenge` | HTTP 200, response body echoes the challenge value |
| TC-WH-02 | N | Invalid verify token | Same | GET with wrong `hub.verify_token` | HTTP 403, challenge not echoed |
| TC-WH-03 | N | Missing verify token | Same | GET with `hub.verify_token` omitted | HTTP 403 |
| TC-WH-04 | P | Valid signed webhook delivery | `WHATSAPP_APP_SECRET` configured | POST a message payload with a correctly computed `x-hub-signature-256` | HTTP 200, message processed |
| TC-WH-05 | N | Invalid signature | Same | POST with a fabricated/incorrect signature header | HTTP 401, payload not processed |
| TC-WH-06 | N | Missing signature header | Same | POST with no `x-hub-signature-256` header at all | HTTP 401 |
| TC-WH-07 | N | Duplicate message delivery | A message with ID `X` was already processed | Re-deliver the same `message.id` | Second delivery is silently ignored (no duplicate reply, no duplicate DB write) |
| TC-WH-08 | N | Unsupported message type |, | Send a message type other than text/audio (e.g. image, location) | HTTP 200, no processing, no crash |
| TC-CR-01 | P | Cron request with correct secret | `CRON_SECRET` configured | POST `/cron/reminders` with matching `x-cron-secret` | HTTP 200 |
| TC-CR-02 | N | Cron request, wrong secret | Same | POST with an incorrect secret value | HTTP 401 |
| TC-CR-03 | N | Cron request, no secret | Same | POST with the header omitted entirely | HTTP 401 |
| TC-CR-04 | N | Cron request, `CRON_SECRET` unset on server | `CRON_SECRET` env var missing | POST with any header value | HTTP 401 (must fail closed, not open) |

## Module 2: Task Logging

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-TL-01 | P | Log a valid task update | "fixed the login redirect bug, PR-501" | Task log row created with summary and task_ref parsed |
| TC-TL-02 | P | Log a task with no ticket reference | "wrote unit tests for the notification service" | Row created, `task_ref` null |
| TC-TL-03 | N | Empty/meaningless message | Voice note transcribed as empty string | No task logged; agent asks for clarification rather than creating a blank record |

## Module 3: Incident Reporting

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-INC-01 | P | New incident, severity stated | "the payments API is returning 500 errors, severity P2" | Incident created with severity=P2 |
| TC-INC-02 | P | New incident, severity not stated | "the payments API is down" | Agent asks for severity before logging |
| TC-INC-03 | P | P1 triggers immediate escalation | Report an incident with severity=P1 | `evaluateEscalation` fires, escalation_events row created, contact notified |
| TC-INC-04 | N | Invalid severity value | Agent attempts `reportIncident` with severity outside P1-P4 | Tool throws/rejects; agent does not silently coerce to a default |
| TC-INC-05 | P | Duplicate detected, user confirms same | Report an incident matching an already-open one; confirm "yes" | `updateIncidentTiming` called, no new row, `reported_at` refreshed |
| TC-INC-06 | P | Duplicate suspected, user says it's different | Same setup; user replies "no, new issue" | `reportIncident` proceeds normally, new row created |
| TC-INC-07 | N | Duplicate-check write-before-confirm | Report an incident matching an open one (ask turn only) | **No DB write occurs** on the asking turn, verified by querying `reported_at` immediately after |
| TC-INC-08 | P | Jira issue created on report | Jira configured with valid credentials and a valid issue type | `jira_issue_key` populated, reply mentions the Jira key |
| TC-INC-09 | N | Jira unreachable/misconfigured | Invalid `JIRA_API_TOKEN` or unset Jira env vars | Incident still created successfully; `jira_issue_key` stays null; no error surfaced to the user |
| TC-INC-10 | N | Jira issue type doesn't exist in project | `JIRA_INCIDENT_ISSUE_TYPE` set to a type not configured in the target project | Jira call fails gracefully (caught), incident still recorded, error logged server-side only |

## Module 4: Blocker Reporting

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-BLK-01 | P | New blocker, severity stated | "blocked on VPN access, severity medium" | Blocker created |
| TC-BLK-02 | P | New blocker, severity omitted | "blocked waiting on design sign-off" | Defaults applied or agent asks, per prompt rules |
| TC-BLK-03 | P | High-severity immediate escalation | severity=high | Escalated immediately via `maybeEscalateBlocker`, not deferred to the sweep |
| TC-BLK-04 | P/N | Duplicate detection (ask/confirm/deny) | Same pattern as TC-INC-05/06/07 | Same expected behaviors as incidents |
| TC-BLK-05 | N | Resolve a non-existent blocker ID | Call `resolveBlocker` with an ID that doesn't exist | Update affects 0 rows; no crash |

## Module 5: Deployment Logging

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-DEP-01 | P | Deployment with explicit date | "deploying X to production tomorrow at 3pm" | Real future ISO date resolved and stored |
| TC-DEP-02 | N | Deployment with no timing information at all | "need to deploy the billing service to production" | Agent asks a follow-up question; **no row created** with a null/guessed date |
| TC-DEP-03 | P | Already-completed deployment, no explicit time | "I already deployed X, it went well" | `scheduledFor` defaults to current date/time; status inferred as success |
| TC-DEP-04 | N | Invalid environment value | Agent attempts `logDeployment` with environment outside staging/production | Tool rejects; no row created |
| TC-DEP-05 | P | Scheduled deployment triggers a reminder | Deployment logged with a future `scheduledFor` | A corresponding `deployment_window` reminder row is scheduled |

## Module 6: Scheduled Sweeps (Cron)

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-SWP-01 | P | Due reminder gets sent | A reminder row with `scheduled_at` in the past, `sent=false` | WhatsApp message sent, row updated to `sent=true` |
| TC-SWP-02 | N | Already-sent reminder is not resent | Run the sweep again after TC-SWP-01 | 0 reminders sent on the second run |
| TC-SWP-03 | N | Future reminder is not sent early | `scheduled_at` in the future | Sweep does not act on it |
| TC-SWP-04 | P | Stale blocker escalates once | Open blocker older than the threshold, `escalated_at` null | Escalation fires, `escalated_at` set |
| TC-SWP-05 | N | Stale blocker does not re-escalate | Run the sweep again immediately after TC-SWP-04 | 0 escalations on the second/third run |
| TC-SWP-06 | P | Re-confirmed blocker becomes eligible again | `updateBlockerTiming` called on an already-escalated blocker | `escalated_at` reset to null, re-escalates after another full threshold period |
| TC-SWP-07 | N | Missed-checkin sweep does not double-notify same day | Run the sweep twice within the same day for the same user | Only the first run notifies; second is a no-op |
| TC-SWP-08 | P | Missed-checkin resets the next day | Run the sweep on day 2 | Notifies again (guard is per-day, not permanent) |

## Module 7: PDF Reports

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-PDF-01 | P | Blockers PDF with open blockers | User has ≥1 open blocker | PDF generated and sent listing them |
| TC-PDF-02 | P | Blockers PDF with none open | User has 0 open blockers | PDF still generated, shows an empty/"none" state, does not error |
| TC-PDF-03 | P | Activity report PDF | User requests "what happened this week" | PDF generated covering the requested window |
| TC-PDF-04 | N | PDF generation tool referenced but not implemented | (Historical regression case) System prompt references a tool not in `TOOL_IMPL` | Should not crash the turn or produce a false "sent" claim, must either implement the tool or fall back safely |

## Module 8: Voice Pipeline (STT)

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-STT-01 | P | Clear English speech | Send a clear English voice note | Accurate English transcript |
| TC-STT-02 | P | Clear Urdu speech | Send a clear Urdu voice note | Accurate Urdu-script or Roman Urdu transcript |
| TC-STT-03 | P | Code-switched speech | "Deployment ho gaya hai lekin production server pe error aa raha hai" | Transcript preserves both languages, not force-translated to one |
| TC-STT-04 | N | Ambiguous/accented audio | Non-native-sounding English audio | Auto-detect correctly identifies English, does not transliterate into Urdu script (regression case) |
| TC-STT-05 | N | Auto-detect lands on an implausible language | Audio that Whisper's auto-detect misreads as a third, unrelated language | Retry-with-forced-`ur` fallback engages; final transcript is not left in the wrong language |
| TC-STT-06 | N | Silent/empty audio | Voice note with no discernible speech | Empty or near-empty transcript handled gracefully, agent asks user to repeat rather than acting on nothing |
| TC-STT-07 | N | Media download failure | Simulate a failed/expired media URL from Meta | User receives an apology/retry message; no crash |

## Module 9: Voice Pipeline (Language Tagging)

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-LNG-01 | P | Pure English classifies correctly | "fixed the login bug" | Tag = `english` |
| TC-LNG-02 | N | English sentence with Roman-Urdu-lookalike words | "check the browser tab, it's on par with staging" ("tab", "par" resemble Urdu words) | Tag = `english` (must not false-positive) |
| TC-LNG-03 | P | Roman Urdu classifies correctly | "Mera deployment complete ho gaya hai" | Tag = `urdu` |
| TC-LNG-04 | P | Urdu script classifies correctly | Native Urdu-script sentence | Tag = `urdu` |
| TC-LNG-05 | P | Genuine code-switching classifies as mixed | "Main ne PR merge kar diya hai lekin staging pe build fail ho raha hai" | Tag = `mixed` |
| TC-LNG-06 | N | Technical nouns alone don't force English | "Mera deployment production mein fail ho gaya" (2 English nouns, Urdu grammar) | Tag = `urdu` or `mixed`, never `english` |
| TC-LNG-07 | N | Tag authority under content mismatch | Tag says ENGLISH but transcript content is garbled/looks like another language | Reply stays in English; does not pattern-match the garbled content's apparent language |
| TC-LNG-08 | N | Empty transcript | Empty string passed to classifier | Returns a safe default (`english`) rather than throwing |

## Module 10: Voice Pipeline (TTS)

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-TTS-01 | P | English reply synthesized correctly | Known-English reply text | English VITS model used, audio returned |
| TC-TTS-02 | P | Urdu reply synthesized correctly | Known-Urdu reply text | Urdu VITS model used, audio returned |
| TC-TTS-03 | N | English technical terms embedded in an Urdu reply | Reply containing "severity", "P1"-"P4" | Terms phonetically rendered into Urdu script, not silently dropped by the tokenizer (regression case) |
| TC-TTS-04 | N | `known_lang` hint mismatches actual content | `known_lang=english` passed but reply text contains Urdu script | Falls through to full classification rather than trusting a wrong hint |
| TC-TTS-05 | N | WhatsApp rejects the audio format | Upload declares the wrong MIME type | Regression case, must declare `audio/mpeg` matching actual MP3 bytes |
| TC-TTS-06 | N | TTS service unreachable | `ai-services` down or `/speak` call fails | Falls back to a text reply rather than the whole turn failing |

## Module 11: Resilience

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-RES-01 | N | LLM API failure mid-conversation | Simulate/encounter a 429 rate-limit error during a tool-calling turn | Graceful fallback reply; **no duplicate or corrupted data** written |
| TC-RES-02 | N | LLM API failure during confirmation turn | Rate limit hits specifically on the "yes, same one" confirmation turn | No new duplicate record created despite the failure |
| TC-RES-03 | N | Database connection failure | Simulate DB unreachable | Request fails cleanly (5xx) rather than hanging or crashing the process |
| TC-RES-04 | N | Malformed tool arguments from the LLM | LLM calls a tool with a missing/invalid required argument | Tool throws, caught by the agent loop, does not crash the whole turn |
