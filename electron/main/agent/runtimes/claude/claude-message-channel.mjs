const MAX_QUEUED_MESSAGES = 4;
const MAX_MESSAGE_CHARACTERS = 128 * 1024;

/** Async SDK input channel that keeps one Claude Code query alive across turns. */
export class ClaudeMessageChannel {
  constructor({ onWarning = () => {} } = {}) {
    this.onWarning = onWarning;
    this.queue = [];
    this.waiter = null;
    this.turnActive = false;
    this.closed = false;
    this.sessionId = "";
  }

  setSessionId(sessionId) {
    this.sessionId = typeof sessionId === "string" ? sessionId : "";
  }

  enqueue(message) {
    if (this.closed) throw new Error("Claude message channel is closed.");
    if (this.turnActive) throw new Error("Claude message channel already has an active turn.");
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      this.turnActive = true;
      waiter({ value: message, done: false });
      return;
    }
    if (this.queue.length >= MAX_QUEUED_MESSAGES) {
      this.onWarning("Claude message channel reached its bounded queue limit.");
      throw new Error("Claude message queue is full.");
    }
    this.queue.push(message);
  }

  onTurnComplete() {
    this.turnActive = false;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.queue = [];
    this.turnActive = false;
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        if (this.queue.length > 0 && !this.turnActive) {
          this.turnActive = true;
          return Promise.resolve({ value: this.queue.shift(), done: false });
        }
        return new Promise((resolve) => { this.waiter = resolve; });
      },
    };
  }
}

export function createClaudeUserMessage(text, sessionId = "") {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_MESSAGE_CHARACTERS) {
    throw new Error("Claude Code prompt is invalid or exceeds the safety limit.");
  }
  return {
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    session_id: typeof sessionId === "string" ? sessionId : "",
  };
}

export const claudeMessageChannelPolicy = Object.freeze({
  maxQueuedMessages: MAX_QUEUED_MESSAGES,
  maxMessageCharacters: MAX_MESSAGE_CHARACTERS,
});

