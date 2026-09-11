# Credential Rotation

`.env` is gitignored and was never committed, but the following real
values were pasted in plaintext into chat sessions during development
and should be rotated before any public demo, handoff, or repo access
grant to someone else.

Rotate in this order — Groq and WhatsApp first since the demo depends
on them; Jira last since it's optional (unset = feature no-ops cleanly).

## 1. Groq API key
1. https://console.groq.com/keys → revoke the exposed key → create a new one.
2. Update `GROQ_API_KEY` in **both** `backend/.env` and `ai-services/.env`
   (both services call Groq independently).
3. Restart both processes — `.env` is not hot-reloaded (backend: restart
   `npm run dev`; ai-services: `docker compose restart ai-services`).
4. Verify: send a WhatsApp text message, confirm a reply comes back.

## 2. WhatsApp access token + app secret
1. Meta App dashboard → your app (DevPlus) → System Users → the
   permanent System User token: regenerate it.
2. Settings → Basic → App Secret: click "Show", regenerate if the option
   is available (Meta may require re-verifying the app first — app
   secret rotation is more involved than the others, budget extra time).
3. Update `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_APP_SECRET` in
   `backend/.env`.
4. Restart the backend.
5. Verify: send a WhatsApp text message, confirm a reply comes back
   (this also implicitly verifies signature validation still passes,
   since a wrong `WHATSAPP_APP_SECRET` makes the webhook reject every
   inbound message).

## 3. Jira API token
1. https://id.atlassian.com/manage-profile/security/api-tokens → revoke
   the exposed token → create a new one.
2. Update `JIRA_API_TOKEN` in `backend/.env`.
3. Restart the backend.
4. Verify: report a test incident, confirm `jira_issue_key` gets
   populated (check the agent's confirmation reply, which mentions the
   Jira key when creation succeeds) — then delete the test issue from
   Jira afterward.

## After rotating all three
- Confirm nobody else has a copy of the old `.env` (no other machine, no
  cloud sync of the project folder with old values still in history).
- This document intentionally does not contain any actual key/token
  values — only where to go to rotate them.
