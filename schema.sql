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
