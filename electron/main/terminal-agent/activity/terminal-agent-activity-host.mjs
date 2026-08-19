export function createTerminalAgentActivityHost({
  activityHost,
  adapterRegistry,
  registrationService,
  logger = console,
  now = Date.now,
}) {
  async function prepareTerminalSession({
    terminalSessionId,
    providerId,
    workspaceRoot,
    webContentsId,
  }) {
    const shellSession = providerId === "shell";
    const adapter = shellSession ? null : adapterRegistry.get(providerId);
    const enabled = shellSession
      ? await registrationService.hasAnyEnabled()
      : Boolean(adapter && await registrationService.isEnabled(providerId));
    if (!enabled) {
      return Object.freeze({ enabled: false, environment: Object.freeze({}) });
    }
    const sessionProviderId = shellSession ? "*" : providerId;
    const transport = await activityHost.prepareTerminalSession({
      terminalSessionId,
      providerId: sessionProviderId,
      workspaceRoot,
      webContentsId,
    });
    return Object.freeze({
      enabled: true,
      environment: Object.freeze({
        PUPPYONE_AGENT_ACTIVITY_ENDPOINT: transport.endpoint,
        PUPPYONE_AGENT_ACTIVITY_TOKEN: transport.token,
        ...(shellSession ? {} : { PUPPYONE_AGENT_ACTIVITY_PROVIDER: providerId }),
        PUPPYONE_AGENT_ACTIVITY_TERMINAL_SESSION_ID: terminalSessionId,
      }),
    });
  }

  async function handleEnvelope(envelope) {
    const adapter = adapterRegistry.get(envelope.providerId);
    if (!adapter) return false;
    const normalized = adapter.normalize(envelope.payload, {
      terminalSessionId: envelope.terminalSessionId,
      occurredAt: now(),
    });
    if (!normalized) return false;
    if (normalized.kind === "source-session-ended") {
      activityHost.closeSourceSession(
        envelope.terminalSessionId,
        normalized.sourceSessionId,
      );
      return true;
    }
    return activityHost.ingest(normalized);
  }

  function closeTerminalSession(terminalSessionId) {
    activityHost.closeTerminalSession(terminalSessionId);
  }

  async function safePrepareTerminalSession(value) {
    try {
      return await prepareTerminalSession(value);
    } catch (error) {
      logger.warn("Agent activity preparation failed; launching without file presence:", error);
      activityHost.closeTerminalSession(value.terminalSessionId);
      return Object.freeze({ enabled: false, environment: Object.freeze({}) });
    }
  }

  return Object.freeze({
    prepareTerminalSession: safePrepareTerminalSession,
    handleEnvelope,
    closeTerminalSession,
    getEnrollmentSnapshot: registrationService.getSnapshot,
    setEnrollmentEnabled: registrationService.setEnabled,
  });
}
