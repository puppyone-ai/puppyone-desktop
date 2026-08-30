import { AcpRuntimeAdapter } from "../../protocols/acp/acp-runtime-adapter.mjs";
import { CURSOR_RUNTIME_DESCRIPTOR } from "./cursor-identity.mjs";

/** Cursor-specific authentication and extension metadata around the shared ACP core. */
export class CursorAcpAdapter extends AcpRuntimeAdapter {
  constructor(options) {
    super({
      ...options,
      runtimeDescriptor: options.runtimeDescriptor ?? CURSOR_RUNTIME_DESCRIPTOR,
      accountType: "cursor",
      sessionTitles: { created: "New Cursor Agent session", resumed: "Cursor Agent session" },
      authenticationMethodId: "cursor_login",
      processArgs: () => [...(options.readiness?.argsPrefix ?? []), "acp"],
      questionMethods: ["cursor/ask_question"],
      capabilityOverrides: {
        structuredQuestions: true,
        manualApprovals: true,
      },
      eventSource: "cursor-acp",
    });
  }
}
