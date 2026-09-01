const MAX_QUEUED_MESSAGES = 4;
const MAX_MESSAGE_CHARACTERS = 128 * 1024;
const MAX_IMAGE_BASE64_CHARACTERS = Math.ceil(5 * 1024 * 1024 * 4 / 3) + 4;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

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

export function createClaudeUserMessage(content, sessionId = "") {
  if (!validClaudeContent(content)) {
    throw new Error("Claude Code prompt is invalid or exceeds the safety limit.");
  }
  return {
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
    session_id: typeof sessionId === "string" ? sessionId : "",
  };
}

function validClaudeContent(value) {
  if (typeof value === "string") return Boolean(value.trim()) && value.length <= MAX_MESSAGE_CHARACTERS;
  if (!Array.isArray(value) || value.length === 0 || value.length > 33) return false;
  let textCharacters = 0;
  let hasText = false;
  for (const block of value) {
    if (block?.type === "text" && typeof block.text === "string") {
      textCharacters += block.text.length;
      hasText ||= Boolean(block.text.trim());
      continue;
    }
    if (block?.type === "image"
      && block.source?.type === "base64"
      && IMAGE_MIME_TYPES.has(block.source.media_type)
      && typeof block.source.data === "string"
      && block.source.data.length > 0
      && block.source.data.length <= MAX_IMAGE_BASE64_CHARACTERS
      && /^[A-Za-z0-9+/]+={0,2}$/.test(block.source.data)) {
      continue;
    }
    return false;
  }
  return hasText && textCharacters <= MAX_MESSAGE_CHARACTERS;
}

export const claudeMessageChannelPolicy = Object.freeze({
  maxQueuedMessages: MAX_QUEUED_MESSAGES,
  maxMessageCharacters: MAX_MESSAGE_CHARACTERS,
  maxImageBase64Characters: MAX_IMAGE_BASE64_CHARACTERS,
});
