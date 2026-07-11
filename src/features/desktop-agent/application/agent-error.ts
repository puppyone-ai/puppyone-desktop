export function formatAgentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("No handler registered for 'agent:")) {
    return "Desktop Agent runtime was updated. Restart PuppyOne once so the native bridge can load.";
  }
  return message;
}
