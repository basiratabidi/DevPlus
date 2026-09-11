import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { logTask } from '../tools/taskLogTool.js';
import { reportIncident, listOpenIncidents, updateIncidentTiming } from '../tools/incidentTool.js';
import { reportBlocker, listOpenBlockers, updateBlockerTiming } from '../tools/blockerTool.js';
import { sendBlockersPdf } from '../tools/blockerPdfTool.js';
import { logDeployment, listUpcomingDeployments } from '../tools/deploymentTool.js';
import { getHistory as getDbHistory } from '../tools/historyTool.js';
import { sendHistoryPdf } from '../tools/historyPdfTool.js';
import { queryProjectActivity } from '../tools/projectActivityTool.js';
import { getHistory as getConvoHistory, appendMessage, clearHistory } from './memory.js';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = path.join(__dirname, '../../prompts/system_prompt.txt');

// Read fresh on every call rather than once at module load - a plain text
// file isn't part of the module graph, so `node --watch` won't reload it
// on edit otherwise, silently leaving a stale prompt in memory.
function getSystemPrompt() {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
}

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'logTask',
      description: 'Log a status update / summary of work done',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          taskRef: { type: ['string', 'null'] },
        },
        required: ['summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reportIncident',
      description: 'Report an engineering incident (bug, outage, failure)',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: ['string', 'null'] },
          severity: { type: 'string', enum: ['P1', 'P2', 'P3', 'P4'] },
          affectedSystem: { type: ['string', 'null'] },
        },
        required: ['title', 'severity'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listOpenIncidents',
      description: "List the user's currently open (non-resolved) incidents - use this to check for a similar already-open incident before calling reportIncident, so the same real-world incident doesn't get logged twice",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateIncidentTiming',
      description: "Use instead of reportIncident when the user confirms they're re-reporting the SAME still-open incident (not a new one) - just bumps its reported time rather than creating a duplicate",
      parameters: {
        type: 'object',
        properties: {
          incidentId: { type: 'number' },
        },
        required: ['incidentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reportBlocker',
      description: 'Report something blocking the user from making progress',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          severity: { type: ['string', 'null'], enum: ['low', 'medium', 'high', null] },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listOpenBlockers',
      description: "List the user's currently open blockers",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateBlockerTiming',
      description: "Use instead of reportBlocker when the user confirms they're re-reporting the SAME still-open blocker (not a new one) - just bumps its reported time rather than creating a duplicate",
      parameters: {
        type: 'object',
        properties: {
          blockerId: { type: 'number' },
        },
        required: ['blockerId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sendBlockersPdf',
      description: "Generate and send a styled PDF of the user's currently open blockers as a WhatsApp document",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'logDeployment',
      description: 'Log a deployment (scheduled or completed) for a service',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string' },
          environment: { type: 'string', enum: ['staging', 'production'] },
          status: {
            type: ['string', 'null'],
            enum: ['scheduled', 'success', 'failed', 'rolled_back', null],
          },
          scheduledFor: {
            type: 'string',
            description:
              'REQUIRED. ISO 8601 date-time, resolved from the user\'s natural-language ' +
              'timing (e.g. "tomorrow", "next Monday 3pm") using the current date/time ' +
              'given in the system prompt. If the deployment already happened and no ' +
              'specific time was given, use the current date/time. If you cannot resolve ' +
              'any usable time at all, do not call this tool yet - ask the user for it first.',
          },
          notes: { type: ['string', 'null'] },
        },
        required: ['serviceName', 'environment', 'scheduledFor'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listUpcomingDeployments',
      description: "List the user's upcoming scheduled deployments",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getHistory',
      description: "Retrieve a user's recent task logs, incidents, blockers, and deployments",
      parameters: {
        type: 'object',
        properties: {
          days: { type: ['number', 'null'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sendHistoryPdf',
      description: "Generate and send a PDF report of the user's recent activity (task logs, incidents, blockers, deployments) as a WhatsApp document",
      parameters: {
        type: 'object',
        properties: {
          days: { type: ['number', 'null'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'queryProjectActivity',
      description: "Look up recent real commit activity in the project's codebase - pulled automatically from git by CI, never from anything a developer typed. Use this for questions like \"what's changed in the code recently?\" or \"what did we ship this week?\", not for the user's own logged incidents/blockers/deployments.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: ['string', 'null'], description: 'Optional keyword to filter commits by (matches commit message, author, or changed files). Omit to get the most recent commits.' },
        },
      },
    },
  },
];

const TOOL_IMPL = {
  logTask: (userId, args) => logTask({ userId, ...args }),
  reportIncident: (userId, args) => reportIncident({ userId, ...args }),
  listOpenIncidents: (userId) => listOpenIncidents({ userId }),
  updateIncidentTiming: (userId, args) => updateIncidentTiming({ incidentId: args.incidentId }),
  reportBlocker: (userId, args) => reportBlocker({ userId, ...args }),
  listOpenBlockers: (userId) => listOpenBlockers({ userId }),
  updateBlockerTiming: (userId, args) => updateBlockerTiming({ blockerId: args.blockerId }),
  sendBlockersPdf: (userId) => sendBlockersPdf({ userId }),
  logDeployment: (userId, args) => logDeployment({ userId, ...args }),
  listUpcomingDeployments: (userId) => listUpcomingDeployments({ userId }),
  getHistory: (userId, args) => getDbHistory({ userId, ...args }),
  sendHistoryPdf: (userId, args) => sendHistoryPdf({ userId, ...args }),
  queryProjectActivity: (userId, args) => queryProjectActivity({ ...args }),
};

// Common near-miss aliases the model sometimes uses instead of the exact tool name
const TOOL_ALIASES = {
  logBlocker: 'reportBlocker',
  logIncident: 'reportIncident',
  getBlockers: 'listOpenBlockers',
  getIncidents: 'listOpenIncidents',
  getOpenIncidents: 'listOpenIncidents',
  updateIncident: 'updateIncidentTiming',
  updateBlocker: 'updateBlockerTiming',
  getDeployments: 'listUpcomingDeployments',
  getHistoryReport: 'sendHistoryPdf',
  sendReport: 'sendHistoryPdf',
  sendBlockerPdf: 'sendBlockersPdf',
  getBlockersPdf: 'sendBlockersPdf',
};

function resolveToolName(name) {
  return TOOL_IMPL[name] ? name : TOOL_ALIASES[name];
}

// Deterministic, fact-based description of what a write tool actually did -
// built from the real tool result, not the LLM's wording. Used as a
// guaranteed fallback confirmation so a database write is never left
// unconfirmed to the user just because reply-generation failed. Returns
// null for read-only tools (nothing was logged) or a failed write.
export function describeToolResult(name, args, result) {
  if (!result || result.error) return null;
  switch (name) {
    case 'logTask':
      return `Logged task update: "${args.summary}"`;
    case 'reportIncident':
      return `Logged ${args.severity} incident #${result.id}: "${args.title}"`
        + (result.jiraIssueKey ? ` (Jira: ${result.jiraIssueKey})` : '');
    case 'updateIncidentTiming':
      return `Updated timing on existing incident #${result.id} (not logged as new)`;
    case 'reportBlocker':
      return `Logged blocker #${result.id}: "${args.description}"`
        + (result.jiraIssueKey ? ` (Jira: ${result.jiraIssueKey})` : '');
    case 'updateBlockerTiming':
      return `Updated timing on existing blocker #${result.id} (not logged as new)`;
    case 'logDeployment':
      return `Logged ${args.environment} deployment #${result.id} for ${args.serviceName}`;
    case 'sendHistoryPdf':
      return result.sent ? `Sent your activity report (last ${result.days} days) as a PDF` : null;
    case 'sendBlockersPdf':
      return result.sent ? `Sent your open blockers (${result.count}) as a PDF` : null;
    default:
      return null;
  }
}

// Some requests need more than one tool call in sequence (e.g. look up a
// blocker's id, then update it) - this bounds how many such rounds a
// single user message may trigger before we force a plain-text reply.
const MAX_TOOL_ROUNDS = 4;

// Per-user: true when the PREVIOUS turn asked a duplicate-confirmation
// question (see DUP_CHECK_GATES below) and is now waiting on the user's
// yes/no answer. In-process only, matches the existing conversation
// memory pattern - resets on restart or server restart.
const pendingDupConfirmation = new Map();

export async function runAgent({ userId, message }) {
  // "restart" command clears conversation memory and short-circuits the LLM call
  if (message.trim().toLowerCase() === 'restart') {
    clearHistory(userId);
    pendingDupConfirmation.delete(userId);
    return 'Conversation restarted. What would you like to log?';
  }

  const currentDateMessage = {
    role: 'system',
    content: `Current date/time: ${new Date().toISOString()}`,
  };

  const messages = [
    { role: 'system', content: getSystemPrompt() },
    currentDateMessage,
    ...getConvoHistory(userId),
    { role: 'user', content: message },
  ];

  let reply;
  // Deterministic, real-result-based description of every successful write
  // this turn made, collected across every round - the guaranteed fallback
  // if the LLM's own confirmation wording fails to generate (see below).
  const confirmations = [];

  // Once a duplicate-check runs (listOpenIncidents/listOpenBlockers), the
  // corresponding update-timing tool is removed from the tools offered for
  // the rest of THIS turn - UNLESS this turn is itself the user's answer
  // to a question asked last turn (awaitingConfirmation), in which case a
  // re-check + update in the same turn is exactly the correct behavior.
  // Without the gate at all, the model can silently chain
  // check -> update -> (only then) ask its confirmation question, all in
  // one turn - meaning the write already happened before the user ever
  // answered, making the question decorative. Confirmed necessary by
  // reproducing exactly that sequence live (incident's reported_at
  // changed on the asking turn, not the confirmation turn) - and the
  // naive same-turn-only version of this gate then wrongly blocked the
  // legitimate update on the real confirmation turn too, since that turn
  // also re-calls listOpen* to look the id back up.
  const DUP_CHECK_GATES = {
    listOpenIncidents: 'updateIncidentTiming',
    listOpenBlockers: 'updateBlockerTiming',
  };
  const awaitingConfirmation = pendingDupConfirmation.get(userId) === true;
  const blockedTools = new Set();
  let dupCheckRanThisTurn = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the final round, don't offer tools at all, forcing a plain-text
    // reply - guarantees the loop terminates instead of chaining forever.
    const toolsAvailable = round < MAX_TOOL_ROUNDS;
    const availableToolDefs = (awaitingConfirmation || blockedTools.size === 0)
      ? toolDefinitions
      : toolDefinitions.filter((t) => !blockedTools.has(t.function.name));

    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages,
        ...(toolsAvailable ? { tools: availableToolDefs, tool_choice: 'auto' } : {}),
      });
    } catch (err) {
      // Covers the case where the model tries to call a tool anyway on the
      // final, tools-less round - Groq hard-rejects that regardless of
      // tool_choice. Don't leave the user with a silently dropped message
      // (previously this surfaced to webhook.js as a bare 500, no reply
      // sent at all) - fall back to a plain confirmation instead.
      console.error('Agent completion failed:', err);
      reply = confirmations.length > 0 ? confirmations.join(' ') : 'Done.';
      break;
    }

    const responseMessage = completion.choices[0].message;
    const toolCalls = responseMessage.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      reply = responseMessage.content ?? "Sorry, I didn't catch that.";
      break;
    }

    messages.push(responseMessage);

    for (const call of toolCalls) {
      const resolvedName = resolveToolName(call.function.name);
      const fn = TOOL_IMPL[resolvedName];
      let result;
      if (!fn) {
        console.warn(`Unknown tool called: ${call.function.name}`);
        result = { error: 'Tool not found' };
      } else {
        try {
          const args = JSON.parse(call.function.arguments);
          result = await fn(userId, args);
          const description = describeToolResult(resolvedName, args, result);
          if (description) confirmations.push(description);
          if (DUP_CHECK_GATES[resolvedName]) {
            dupCheckRanThisTurn = true;
            blockedTools.add(DUP_CHECK_GATES[resolvedName]);
          }
        } catch (err) {
          console.error(`Tool ${resolvedName} failed:`, err);
          result = { error: err.message };
        }
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result ?? {}),
      });
    }
  }

  if (reply === undefined) {
    // Ran out of rounds without a plain-text reply - still confirm
    // whatever was actually written rather than saying nothing useful.
    reply = confirmations.length > 0 ? confirmations.join(' ') : 'Done.';
  }

  // Resolve the confirmation state machine for next turn: if this turn was
  // itself the answer to a pending question, that cycle is over either way
  // (whether the user said yes or no). Otherwise, if a dup-check ran and
  // was gated (blockedTools not empty means the update tool was withheld),
  // the only way this turn could still end in plain text is by asking a
  // question - so expect the next turn to be the answer.
  if (awaitingConfirmation) {
    pendingDupConfirmation.delete(userId);
  } else if (dupCheckRanThisTurn) {
    pendingDupConfirmation.set(userId, true);
  } else {
    pendingDupConfirmation.delete(userId);
  }

  appendMessage(userId, 'user', message);
  appendMessage(userId, 'assistant', reply);
  return reply;
}