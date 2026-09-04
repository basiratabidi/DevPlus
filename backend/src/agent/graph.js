import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { logTask } from '../tools/taskLogTool.js';
import { reportIncident } from '../tools/incidentTool.js';
import { reportBlocker, listOpenBlockers } from '../tools/blockerTool.js';
import { logDeployment, listUpcomingDeployments } from '../tools/deploymentTool.js';
import { getHistory as getDbHistory } from '../tools/historyTool.js';
import { sendHistoryPdf } from '../tools/historyPdfTool.js';
import { getHistory as getConvoHistory, appendMessage, clearHistory } from './memory.js';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(
  path.join(__dirname, '../../prompts/system_prompt.txt'),
  'utf-8'
);

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
          notes: { type: ['string', 'null'] },
        },
        required: ['serviceName', 'environment'],
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
];

const TOOL_IMPL = {
  logTask: (userId, args) => logTask({ userId, ...args }),
  reportIncident: (userId, args) => reportIncident({ userId, ...args }),
  reportBlocker: (userId, args) => reportBlocker({ userId, ...args }),
  listOpenBlockers: (userId) => listOpenBlockers({ userId }),
  logDeployment: (userId, args) => logDeployment({ userId, ...args }),
  listUpcomingDeployments: (userId) => listUpcomingDeployments({ userId }),
  getHistory: (userId, args) => getDbHistory({ userId, ...args }),
  sendHistoryPdf: (userId, args) => sendHistoryPdf({ userId, ...args }),
};

// Common near-miss aliases the model sometimes uses instead of the exact tool name
const TOOL_ALIASES = {
  logBlocker: 'reportBlocker',
  logIncident: 'reportIncident',
  getBlockers: 'listOpenBlockers',
  getDeployments: 'listUpcomingDeployments',
  getHistoryReport: 'sendHistoryPdf',
  sendReport: 'sendHistoryPdf',
};

function resolveToolName(name) {
  return TOOL_IMPL[name] ? name : TOOL_ALIASES[name];
}

export async function runAgent({ userId, message }) {
  // "restart" command clears conversation memory and short-circuits the LLM call
  if (message.trim().toLowerCase() === 'restart') {
    clearHistory(userId);
    return 'Conversation restarted. What would you like to log?';
  }

  const priorMessages = getConvoHistory(userId);

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...priorMessages,
      { role: 'user', content: message },
    ],
    tools: toolDefinitions,
    tool_choice: 'auto',
  });

  const responseMessage = completion.choices[0].message;
  const toolCalls = responseMessage.tool_calls;

  if (!toolCalls || toolCalls.length === 0) {
    const reply = responseMessage.content ?? "Sorry, I didn't catch that.";
    appendMessage(userId, 'user', message);
    appendMessage(userId, 'assistant', reply);
    return reply;
  }

  const toolResults = [];
  for (const call of toolCalls) {
    const resolvedName = resolveToolName(call.function.name);
    const fn = TOOL_IMPL[resolvedName];
    if (!fn) {
      console.warn(`Unknown tool called: ${call.function.name}`);
      toolResults.push({ name: call.function.name, result: { error: 'Tool not found' } });
      continue;
    }
    const args = JSON.parse(call.function.arguments);
    const result = await fn(userId, args);
    toolResults.push({ name: resolvedName, result });
  }


  const followUp = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...priorMessages,
      { role: 'user', content: message },
      responseMessage,
      ...toolCalls.map((call, i) => ({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(toolResults[i]?.result ?? {}),
      })),
    ],
  });

  const reply = followUp.choices[0].message.content;
  appendMessage(userId, 'user', message);
  appendMessage(userId, 'assistant', reply);
  return reply;
}