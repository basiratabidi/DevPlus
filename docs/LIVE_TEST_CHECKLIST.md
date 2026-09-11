# Live Test Checklist: Escalation Notify & Multi-User

These two gaps need a second real WhatsApp number and can't be closed
by automated tests or single-number testing. Both need Meta's test
number to have a second **verified recipient** added (Meta App
dashboard → WhatsApp → API Setup → "To" number list, test numbers cap
at 5 verified recipients).

## A. Escalation contact live-notify (closes TC-INC-03 / TC-BLK-03's
untested branch)

Setup:
1. On your primary test number, either re-run onboarding (`restart`,
   then go through it again) or send a message like *"add [second
   number] as my escalation contact, name [Name]"* if the agent exposes
   that outside onboarding, otherwise onboarding's `addEscalationContact`
   step is the path.
2. Confirm it saved: ask the agent something that surfaces it, or check
   directly:
   ```sql
   SELECT * FROM escalation_contacts WHERE user_id = <your id>;
   ```

Test:
1. From your primary number, report a **P1 incident** (e.g. *"prod is
   completely down, P1"*).
2. **Expected**: the second number physically receives a WhatsApp
   message like `Escalation triggered (...) for user <id>. Source:
   incident #<id>.`, this is the part that has never been confirmed
   with a real second device.
3. Repeat with a **high-severity blocker** to cover TC-BLK-03's
   immediate-escalation path too.
4. Record the actual result in `docs/TESTING.md`'s escalation rows,
   replace `notified: false` (no-contact case, already covered) with a
   `notified: true` row that states the message was physically received.

## B. Multi-user concurrency

Setup: a second WhatsApp number, onboarded as a **different** user
(different name/role/team from your primary test identity).

Test sequence, interleave rather than run sequentially, to actually
exercise concurrency:
1. **User A** logs a task update.
2. **User B** (near-simultaneously) reports an incident.
3. **Expected**: each gets a reply about *their own* action only, User
   A's reply never mentions User B's incident and vice versa. This
   checks that `userId`-scoped conversation memory (`agent/memory.js`)
   and the `pendingDupConfirmation` map in `graph.js` are correctly
   keyed per-user and don't leak state across users.
4. **User A** reports an incident, then **before answering** the
   duplicate-check follow-up (if one fires), **User B** reports an
   unrelated incident of their own in between.
5. **Expected**: User A's still-pending confirmation state isn't
   disturbed by User B's turn; when User A does answer, it resolves
   correctly against User A's own pending question, not User B's.
6. Check `docs/TESTING.md`'s "Multi-user testing" gap can move from
   *not confirmed* to a recorded result once this sequence is run and
   observed.

## After running both
Update `docs/DevPulse-Status.md`'s "Genuinely still open" list, move
whichever of these two items passed into the "Built and confirmed
working" section, with the same "verified live, not assumed" framing
used elsewhere in that doc.
