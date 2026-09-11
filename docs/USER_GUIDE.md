# DevPulse User Guide

DevPulse is a WhatsApp assistant for your team's daily engineering ops.
No app, no login, no command syntax, just message the business number
like you'd message a teammate, in English, Urdu, or Roman Urdu, by text
or voice.

## Getting started

Message the DevPulse number for the first time and it'll register you
automatically, no separate signup. It'll ask for:
1. Your name
2. Your role and team (e.g. "developer, backend team")
3. Who to notify if one of your P1 incidents or high-severity blockers
   needs urgent attention (a manager, another lead, an on-call backup,
   whoever makes sense for you). You can skip this and add it later.

That's it, after that, everything below just works from a normal
message.

## Logging a status update

Just say what you did:
> "fixed the login bug"

> "deployed the payment service to staging"

No format required, DevPulse extracts what it needs from plain
sentences.

## Reporting an incident

Describe what's broken:
> "the CDN is serving stale assets"

If you don't mention severity, it'll ask:
> "What severity is this, P1, P2, P3, or P4?"

- **P1** = critical, something's down
- **P2** = major
- **P3** = minor
- **P4** = cosmetic

A P1 immediately notifies your escalation contact (if you've set one),
DevPulse will tell you when it does this, and never claims to have
notified anyone unless it actually did.

## Reporting a blocker

> "waiting on API keys to continue the integration work"

If not stated, severity defaults to medium; say "this is high priority"
or similar if it's blocking urgently, high-severity blockers escalate
immediately, same as a P1 incident.

## Logging a deployment

> "deploying the payment service to production tomorrow at 3pm"

DevPulse needs a real date/time for this, if it can't figure one out
from your message, it'll ask rather than guess.

## "Didn't I already report this?"

If you report something that sounds like an incident or blocker you
already have open, DevPulse will ask before creating a duplicate:
> "Is this the same incident as 'CDN serving stale assets' you reported
> earlier, or a new one?"

Answer "yes, same one" and it just refreshes the timestamp on the
existing report, no duplicate created. Answer "no, different" and it
logs normally.

## Voice notes

Send a voice note instead of typing, in English, Urdu, or Roman Urdu
(including messages that naturally mix English technical words into
Urdu, e.g. "mera deployment fail ho gaya"), DevPulse transcribes it,
processes it the same way as text, and replies with a voice note back.

## Getting reports

> "what happened this week?" → sends a PDF activity summary as a
WhatsApp document.

> "show my open blockers" → sends a PDF list of your currently open
blockers.

## Reminders

DevPulse sends automated reminders (e.g. standup time) based on your
profile, you don't need to ask for these.

## Starting over

If a conversation gets confused, just type:
> "restart"

This clears DevPulse's memory of the current conversation and starts
fresh, it doesn't affect anything already logged.

## A note on Jira

If your team has Jira integration configured, a new incident or blocker
report also creates a matching Jira issue automatically, DevPulse will
mention the issue key (e.g. "Jira: SCRUM-6") in its reply when this
happens. If it doesn't mention one, your report was still saved in
DevPulse either way, Jira is a bonus, never a requirement.
