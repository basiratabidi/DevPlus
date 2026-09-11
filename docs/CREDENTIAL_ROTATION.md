# Credential Rotation

`.env` is gitignored and was never committed, but the following real
values were pasted in plaintext into chat sessions during development
and should be rotated before any public demo, handoff, or repo access
grant to someone else.

Rotate in this order — Groq and WhatsApp first since the demo depends
on them; Jira last since it's optional (unset = feature no-ops cleanly).

## 1. Groq API key — ✅ done
1. https://console.groq.com/keys → revoke the exposed key → create a new one.
2. Update `GROQ_API_KEY` in **both** `backend/.env` and `ai-services/.env`
   (both services call Groq independently).
3. Restart both processes — `.env` is not hot-reloaded (backend: restart
   `npm run dev`; ai-services: `docker compose restart ai-services`).
4. Verify: both processes restarted and confirmed reachable; the exact
   agent code path (`runAgent`) tested directly and returned a real LLM
   response on the new key.

## 2. WhatsApp access token + app secret — ⚠️ partially done
1. Meta App dashboard → your app (DevPlus) → System Users → the
   permanent System User token: regenerate it. — **done**, updated in
   `backend/.env`, backend restarted, and verified via a real read-only
   Graph API call against the phone number ID (confirmed the new token
   authenticates).
2. Settings → Basic → App Secret: click "Show", regenerate if the option
   is available. — **not actually rotated**: the value pasted back was
   byte-for-byte identical to the existing one, meaning Meta's "Show"
   button re-revealed the current secret rather than generating a new
   one. Needs a real "Reset"/regenerate action on Meta's side if one
   exists in the dashboard; if Meta has no such option for App Secret
   short of a broader app reset, that's a real constraint to note rather
   than something still pending indefinitely.

## 3. Jira API token — ✅ done
1. https://id.atlassian.com/manage-profile/security/api-tokens → revoke
   the exposed token → create a new one.
2. Update `JIRA_API_TOKEN` in `backend/.env`.
3. Restart the backend.
4. Verify: new token confirmed directly against Jira's `/rest/api/3/myself`
   endpoint using the same Basic-auth scheme `jiraClient.js` uses
   (HTTP 200, authenticated as the right account) — a full test-incident
   round trip wasn't needed on top of that to prove the credential works.

## Status
- Groq: ✅ rotated and verified.
- WhatsApp access token: ✅ rotated and verified.
- WhatsApp App Secret: ⚠️ not actually rotated — the value Meta returned
  was identical to the old one (see §2 above). Still exposed; revisit
  if Meta's dashboard turns out to have a real regenerate option.
- Jira API token: ✅ rotated and verified.

## After rotating all three
- Confirm nobody else has a copy of the old `.env` (no other machine, no
  cloud sync of the project folder with old values still in history).
- This document intentionally does not contain any actual key/token
  values — only where to go to rotate them.
