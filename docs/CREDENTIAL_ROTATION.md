# Credential Rotation

`.env` is gitignored and was never committed, but the following real
values were pasted in plaintext into chat sessions during development
and should be rotated before any public demo, handoff, or repo access
grant to someone else.

Rotate in this order: Groq and WhatsApp first since the demo depends
on them; Jira last since it's optional (unset = feature no-ops cleanly).

## 1. Groq API key (✅ done)
1. https://console.groq.com/keys → revoke the exposed key → create a new one.
2. Update `GROQ_API_KEY` in **both** `backend/.env` and `ai-services/.env`
   (both services call Groq independently).
3. Restart both processes, `.env` is not hot-reloaded (backend: restart
   `npm run dev`; ai-services: `docker compose restart ai-services`).
4. Verify: both processes restarted and confirmed reachable; the exact
   agent code path (`runAgent`) tested directly and returned a real LLM
   response on the new key.

## 2. WhatsApp access token + app secret (✅ done)
1. Meta App dashboard → your app (DevPlus) → System Users → the
   permanent System User token: regenerate it. **Done** - updated in
   `backend/.env`, backend restarted, and verified via a real read-only
   Graph API call against the phone number ID (confirmed the new token
   authenticates).
2. Settings → Basic → App Secret: "Show" alone only re-reveals the
   current value - the actual action is **Reset app secret** (separate
   button), with a grace-period prompt for how long the old secret keeps
   working. Used a 0-hour grace period since the old value was already
   exposed and we restarted immediately after. **Done** - new value
   saved directly to `backend/.env` (never pasted into a chat/log after
   the reset), backend restarted, and verified with three direct
   requests against the live webhook signature check
   (`webhook.js`/`isValidSignature`): a payload signed with the new
   secret was accepted (200), the same payload signed with the *old*
   secret was rejected (401), and an unsigned request was rejected
   (401) - confirming the old secret is genuinely dead server-side, not
   just cosmetically replaced.

## 3. Jira API token (✅ done)
1. https://id.atlassian.com/manage-profile/security/api-tokens → revoke
   the exposed token → create a new one.
2. Update `JIRA_API_TOKEN` in `backend/.env`.
3. Restart the backend.
4. Verify: new token confirmed directly against Jira's `/rest/api/3/myself`
   endpoint using the same Basic-auth scheme `jiraClient.js` uses
   (HTTP 200, authenticated as the right account), a full test-incident
   round trip wasn't needed on top of that to prove the credential works.

## Status
- Groq: ✅ rotated and verified.
- WhatsApp access token: ✅ rotated and verified.
- WhatsApp App Secret: ✅ rotated and verified (see §2 above).
- Jira API token: ✅ rotated and verified.

## After rotating all three
- Confirm nobody else has a copy of the old `.env` (no other machine, no
  cloud sync of the project folder with old values still in history).
- This document intentionally does not contain any actual key/token
  values, only where to go to rotate them.
