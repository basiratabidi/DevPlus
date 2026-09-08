import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { createUser, upsertProfile, addEscalationContact, markOnboardingComplete } from '../tools/profileTool.js';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ONBOARDING_PROMPT = readFileSync(
  path.join(__dirname, '../../prompts/onboarding_prompt.txt'),
  'utf-8'
);

const sessions = new Map();

function getSession(phoneNumber, existingUserId) {
  if (!sessions.has(phoneNumber)) {
    sessions.set(phoneNumber, {
      messages: [],
      userId: existingUserId ?? null,
      completed: false,
    });
  }
  return sessions.get(phoneNumber);
}

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'createUser',
      description: "Register the new user's name. Call this as soon as you have their name.",
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'upsertProfile',
      description: "Save the user's role, team, and standup preferences.",
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string' },
          team: { type: 'string' },
          standupTime: { type: ['string', 'null'], description: 'HH:MM 24h format, default 10:00 if not specified' },
        },
        required: ['role', 'team'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addEscalationContact',
      description: "Save the user's team lead as their escalation contact.",
      parameters: {
        type: 'object',
        properties: {
          contactName: { type: 'string' },
          contactNumber: { type: 'string', description: 'WhatsApp number, digits only' },
        },
        required: ['contactName', 'contactNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'completeOnboarding',
      description: 'Call this as the final step once role/team are saved and the escalation contact has either been added or explicitly skipped. Required to finish onboarding.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

async function executeTool(call, phoneNumber, session) {
  const args = JSON.parse(call.function.arguments);

  if (call.function.name === 'createUser') {
    const result = await createUser({ whatsappNumber: phoneNumber, name: args.name });
    session.userId = result.id;
    return result;
  }
  if (call.function.name === 'upsertProfile') {
    if (!session.userId) return { error: 'No user registered yet - name must be captured first' };
    return await upsertProfile({
      userId: session.userId,
      role: args.role,
      team: args.team,
      standupTime: args.standupTime || undefined,
    });
  }
  if (call.function.name === 'addEscalationContact') {
    if (!session.userId) return { error: 'No user registered yet - name must be captured first' };
    return await addEscalationContact({
      userId: session.userId,
      contactName: args.contactName,
      contactNumber: args.contactNumber,
    });
  }
  if (call.function.name === 'completeOnboarding') {
    if (!session.userId) return { error: 'No user registered yet' };
    const result = await markOnboardingComplete({ userId: session.userId });
    session.completed = true;
    return result;
  }
  return { error: 'Unknown tool' };
}

export async function runOnboarding({ phoneNumber, message, existingUserId }) {
  const session = getSession(phoneNumber, existingUserId);

  const messages = [
    { role: 'system', content: ONBOARDING_PROMPT },
    ...session.messages,
    { role: 'user', content: message },
  ];

  let finalReply = null;
  const MAX_ITERATIONS = 5;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      messages,
      tools: toolDefinitions,
      tool_choice: 'auto',
    });

    const responseMessage = completion.choices[0].message;
    const toolCalls = responseMessage.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      finalReply = responseMessage.content ?? "Sorry, could you repeat that?";
      break;
    }

    messages.push(responseMessage);

    for (const call of toolCalls) {
      const result = await executeTool(call, phoneNumber, session);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  if (finalReply === null) {
    finalReply = "Let's continue - what would you like to add next?";
  }

  session.messages.push({ role: 'user', content: message });
  session.messages.push({ role: 'assistant', content: finalReply });

  if (session.completed) {
    sessions.delete(phoneNumber);
  }

  return { reply: finalReply, completed: session.completed };
}