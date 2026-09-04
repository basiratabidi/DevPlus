// Simple in-process conversation memory: last 15 messages per user.
// NOTE: this resets whenever the server restarts. Fine for a demo/prototype;
// swap for a DB-backed store (e.g. a conversation_messages table) before
// treating this as production-durable.

const MAX_MESSAGES = 15;
const store = new Map(); // userId -> array of { role, content }

export function getHistory(userId) {
  return store.get(userId) ?? [];
}

export function appendMessage(userId, role, content) {
  const history = store.get(userId) ?? [];
  history.push({ role, content });
  if (history.length > MAX_MESSAGES) {
    history.splice(0, history.length - MAX_MESSAGES);
  }
  store.set(userId, history);
}

export function clearHistory(userId) {
  store.delete(userId);
}