# DevPulse

Agentic WhatsApp assistant for engineering team ops: task status logs,
incident reports, blockers, deployment tracking, standup reminders, and
severity-based escalation to a team lead.

Architecture pattern (WhatsApp -> LangGraph-style agent -> controlled tools ->
PostgreSQL, with n8n for time-based sweeps) mirrors a GlucoWhats-style build,
applied to a different case study so it's safe to use as a separate,
citable project.

## Status
Scaffold only, not yet run or tested. Treat every file here as a first draft
to compile/run and debug, not working code.

## Structure
```
devpulse/
  schema.sql              -- Postgres tables
  src/
    db/pool.js             -- DB connection
    tools/
      taskLogTool.js
      incidentTool.js
      historyTool.js
      reminderTool.js
      escalationRuleTool.js
    agent/graph.js          -- LLM + tool-calling logic (Groq)
    whatsapp/
      sendMessage.js         -- outbound via Evolution API
      webhook.js              -- inbound handler
    index.js                -- express server
```

## Known unknowns you must verify before this runs
1. **Evolution API payload shapes** (`sendMessage.js`, `webhook.js`) - the
   exact route, header, and JSON field names depend on your Evolution API
   version. Log a real webhook payload and check your instance's Swagger
   before trusting the destructuring/paths as written.
2. **@langchain/langgraph API surface** (`agent/graph.js`) - the current
   skeleton bypasses LangGraph entirely and calls Groq's tool-calling API
   directly, since I'm not confident of the current LangGraph JS syntax.
   If you want an actual StateGraph (multiple nodes, conditional routing),
   check the LangGraph JS docs for the version in `package.json` and adapt.
3. **Groq SDK tool-calling parameter names** - `tools` / `tool_choice`
   follow the common OpenAI-style convention; confirm against the installed
   `groq-sdk` version's README.
4. **Package versions in `package.json`** are placeholders reflecting
   roughly-current package names, not verified pinned versions - run
   `npm info <package> version` or check npm before installing.

## Setup (once you've verified the above)
```bash
cd devpulse
npm install
cp .env.example .env   # fill in DATABASE_URL, GROQ_API_KEY, Evolution API details
psql "$DATABASE_URL" -f schema.sql
npm run dev
```

## Suggested build order for a Sept 27 deadline
1. **DB + tools, no WhatsApp yet.** Get `schema.sql` applied and write a
   throwaway test script that calls `logTask`, `reportIncident`,
   `getHistory` directly, no LLM, no webhook. Confirms your data layer.
2. **Agent loop against Groq**, tested via a local script (pass a fake
   `userId` and a message string to `runAgent`), still no WhatsApp.
   Confirms tool-calling actually selects the right tool.
3. **Wire up Evolution API** for real inbound/outbound - this is the part
   most likely to eat time on payload-shape mismatches, so do it once the
   rest is proven, not first.
4. **n8n cron workflows**: poll `getDueReminders`/`findMissedCheckins`
   (reminderTool.js) and `checkStaleBlockers` (escalationRuleTool.js) every
   few minutes, call `sendWhatsAppMessage` for anything due.
5. **Cut list if time runs short**: deployments tool, CI/CD log ingestion
   stretch feature, dashboard - all after 1-4 are solid and demoable.

## Not yet built
- `blockerTool.js`, `deploymentTool.js`, `profileTool.js`,
  `notificationTool.js` (thin wrapper over `sendWhatsAppMessage`),
  `missedCheckinTool.js` as agent-callable (currently only as a
  scheduler-facing function in `reminderTool.js`)
- n8n workflow JSON exports
- Any tests
# DevPlus
