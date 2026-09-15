-- DevPulse database schema
-- Mirrors the GlucoWhats entity pattern: Users -> Profiles -> domain logs -> Reminders -> EscalationEvents

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    whatsapp_number VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role                VARCHAR(50),         -- e.g. 'developer', 'team_lead', 'devops'
    team                VARCHAR(50),
    working_hours_start TIME DEFAULT '09:00',
    working_hours_end   TIME DEFAULT '18:00',
    standup_time        TIME DEFAULT '10:00',
    notify_on_p1        BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- Core "urgent" entity, equivalent to HealthRecords/glucose readings
CREATE TABLE IF NOT EXISTS incidents (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    severity        VARCHAR(10) CHECK (severity IN ('P1','P2','P3','P4')) NOT NULL,
    affected_system VARCHAR(100),
    status          VARCHAR(20) CHECK (status IN ('open','investigating','resolved')) DEFAULT 'open',
    reported_at     TIMESTAMPTZ DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

-- Status updates / what someone worked on, equivalent to Meals
CREATE TABLE IF NOT EXISTS task_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    summary     TEXT NOT NULL,
    task_ref    VARCHAR(50),      -- optional ticket/PR id
    logged_at   TIMESTAMPTZ DEFAULT now()
);

-- Scheduled/ad-hoc deployment logs, equivalent to Medications (time-based)
CREATE TABLE IF NOT EXISTS deployments (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
    service_name   VARCHAR(100) NOT NULL,
    environment    VARCHAR(20) CHECK (environment IN ('staging','production')) NOT NULL,
    status         VARCHAR(20) CHECK (status IN ('scheduled','success','failed','rolled_back')) DEFAULT 'scheduled',
    scheduled_for  TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    notes          TEXT
);

-- Free-text blocker reports, equivalent to Symptoms
CREATE TABLE IF NOT EXISTS blockers (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    description  TEXT NOT NULL,
    severity     VARCHAR(10) CHECK (severity IN ('low','medium','high')) DEFAULT 'medium',
    status       VARCHAR(20) CHECK (status IN ('open','resolved')) DEFAULT 'open',
    reported_at  TIMESTAMPTZ DEFAULT now(),
    resolved_at  TIMESTAMPTZ
);

-- Standup / deployment-window reminders, equivalent to Reminders
CREATE TABLE IF NOT EXISTS reminders (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type         VARCHAR(30) CHECK (type IN ('standup','deployment_window','blocker_followup')) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent         BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- Escalation contact (team lead / on-call), equivalent to TrustedContacts
CREATE TABLE IF NOT EXISTS escalation_contacts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE, -- whose escalation contact this is
    contact_name    VARCHAR(100) NOT NULL,
    contact_number  VARCHAR(20) NOT NULL,
    relation        VARCHAR(50)  -- e.g. 'team_lead', 'on_call'
);

-- Fired when a severity rule triggers, equivalent to SafetyEvents
CREATE TABLE IF NOT EXISTS escalation_events (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
    source_type      VARCHAR(20) CHECK (source_type IN ('incident','blocker','missed_checkin')) NOT NULL,
    source_id        INTEGER,          -- FK to incidents.id or blockers.id (nullable for missed_checkin)
    rule_triggered   VARCHAR(100) NOT NULL,   -- e.g. 'P1_incident', 'blocker_open_48h'
    notified_contact INTEGER REFERENCES escalation_contacts(id),
    triggered_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_user ON incidents(user_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_user_date ON task_logs(user_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_blockers_status ON blockers(status);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(sent, scheduled_at);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;

-- De-dup guards: without these, checkStaleBlockers/runMissedCheckinSweep
-- re-escalate and re-notify on every cron sweep for as long as the
-- underlying condition stays true (confirmed by direct testing).
ALTER TABLE blockers ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- Jira integration: links a DevPulse incident/blocker to the Jira issue
-- auto-created for it (one-way push, DevPulse stays the source of truth
-- for the conversation). Null when Jira isn't configured or the create
-- call failed - it's a best-effort side effect, not a hard dependency.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS jira_issue_key VARCHAR(20);
ALTER TABLE blockers ADD COLUMN IF NOT EXISTS jira_issue_key VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_missed_checkin_alert DATE;

-- Projects: a shared, team-wide list (not per-user). A logged item
-- (task/incident/blocker/deployment) can be tied to one, so
-- duplicate-detection and reporting are scoped per-project as well as
-- per-user - two different users each reporting "DB down" for two
-- DIFFERENT projects shouldn't be treated as related. The connected-
-- external-project error intake (system-monitoring user,
-- errorIngestTool.js) shares this same table rather than just encoding
-- the project name as a string prefix in the incident/blocker title.
CREATE TABLE IF NOT EXISTS projects (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE blockers ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);


-- ============================================================
-- FULL CLEAN SEED, wipes existing test junk, rebuilds cleanly
-- around ONE verified user (923392001026)
-- ============================================================

-- 1. Clean slate, remove all existing rows (CASCADE handles dependents)
--TRUNCATE users, profiles, incidents, task_logs, deployments,
--       blockers, reminders, escalation_contacts, escalation_events
--       RESTART IDENTITY CASCADE;

-- 2. The one real, verified user
--INSERT INTO users (whatsapp_number, name)
--VALUES ('923392001026', 'Basirat');
-- id = 1 (since we just restarted identity)

-- 3. Profile, standup_time in the past, so missed-checkin sweep can trigger
--INSERT INTO profiles (user_id, role, team, standup_time, notify_on_p1)
--VALUES (1, 'developer', 'backend', CURRENT_TIME - interval '1 hour', TRUE);

-- 4. Escalation contact, same verified number, since Meta's test tier
-- only allows messaging this one number regardless of role
--INSERT INTO escalation_contacts (user_id, contact_name, contact_number, relation)
--VALUES (1, 'Team Lead', '923392001026', 'team_lead');

-- 5. A resolved incident from "yesterday" (so history/report tools have data)
--INSERT INTO incidents (user_id, title, description, severity, affected_system, status, reported_at, resolved_at)
--VALUES (1, 'API timeout spike', 'Elevated 504s on /api/orders', 'P2', 'orders-api', 'resolved',
--        now() - interval '1 day', now() - interval '20 hours');

-- 6. An open P1 incident (for testing escalation path directly)
--INSERT INTO incidents (user_id, title, description, severity, affected_system, status, reported_at)
--VALUES (1, 'Database down in production', 'Primary DB unreachable', 'P1', 'postgres-primary', 'open',
--        now() - interval '10 minutes');

-- 7. A task log for "yesterday" (history), NOT today (so missed-checkin still triggers)
--INSERT INTO task_logs (user_id, summary, task_ref, logged_at)
--VALUES (1, 'Fixed pagination bug in orders list', 'PR-142', now() - interval '1 day');

-- 8. A completed deployment (history)
--INSERT INTO deployments (user_id, service_name, environment, status, scheduled_for, completed_at, notes)
--VALUES (1, 'orders-api', 'production', 'success', now() - interval '2 days', now() - interval '2 days', 'Routine release');

-- 9. An upcoming scheduled deployment
--INSERT INTO deployments (user_id, service_name, environment, status, scheduled_for, notes)
--VALUES (1, 'auth-service', 'staging', 'scheduled', now() + interval '1 day', 'Testing new OAuth flow');

-- 10. An open blocker, NOT yet stale (for listOpenBlockers tool test)
--INSERT INTO blockers (user_id, description, severity, status, reported_at)
--VALUES (1, 'Waiting on AWS access to staging bucket', 'medium', 'open', now() - interval '2 hours');

-- 11. A stale open blocker, >48h old (for /cron/stale-blockers test)
--INSERT INTO blockers (user_id, description, severity, status, reported_at)
--VALUES (1, 'Blocked on design sign-off for new dashboard', 'high', 'open', now() - interval '50 hours');

-- 12. A due, unsent reminder (for /cron/reminders test)
--INSERT INTO reminders (user_id, type, scheduled_at, sent)
--VALUES (1, 'standup', now() - interval '5 minutes', FALSE);
