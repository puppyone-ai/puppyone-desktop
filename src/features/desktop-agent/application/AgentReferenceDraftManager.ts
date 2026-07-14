import type {
  AgentDraftReference,
  AgentReferenceInputCapabilities,
} from "../domain/agent-contract";
import type { AgentClientPort, AgentClientProvider } from "./AgentClientPort";
import type { AgentControllerState } from "./agent-controller-state";
import { AgentKnownError, formatAgentError } from "./agent-error";
import { mergeAgentReferences } from "./agent-controller-values";

type AgentReferenceDraftManagerOptions = {
  workspaceRoot: string;
  bridgeProvider: AgentClientProvider;
  readState: () => AgentControllerState;
  patch: (patch: Partial<AgentControllerState>) => void;
  appendText: (text: string) => void;
};

/** Owns draft reference acquisition, validation, retry material and grant release. */
export class AgentReferenceDraftManager {
  private retryFiles = new Map<string, File>();
  private epoch = createReferenceEpoch();

  constructor(private readonly options: AgentReferenceDraftManagerOptions) {}

  get referenceEpoch() {
    return this.epoch;
  }

  async addWorkspacePaths(paths: string[]) {
    const bridge = this.requireBridge("resolveAgentWorkspaceReferences");
    const uniquePaths = Array.from(new Set(paths.filter(Boolean))).slice(0, 32);
    const resolved = await Promise.all(uniquePaths.map(async (path) => {
      try {
        const references = await bridge.resolveAgentWorkspaceReferences({
          rootPath: this.options.workspaceRoot,
          paths: [path],
        });
        return references.map((reference) => this.withCapabilityStatus(reference));
      } catch (error) {
        return [workspaceReferenceError(path, error)];
      }
    }));
    const references = resolved.flat();
    const state = this.options.readState();
    const existingIds = new Set(state.references.map((reference) => reference.id));
    const merged = this.mergeAndValidate(state.references, references);
    this.options.patch({ references: merged, error: null });
    return merged.filter((reference) => reference.status === "ready" && !existingIds.has(reference.id)).length;
  }

  async pickWorkspaceReferences() {
    const bridge = this.requireBridge("pickAgentWorkspaceReferences");
    try {
      const references = (await bridge.pickAgentWorkspaceReferences({ rootPath: this.options.workspaceRoot }))
        .map((reference) => this.withCapabilityStatus(reference));
      const state = this.options.readState();
      const existingIds = new Set(state.references.map((reference) => reference.id));
      const merged = this.mergeAndValidate(state.references, references);
      this.options.patch({ references: merged, error: null });
      return merged.filter((reference) => reference.status === "ready" && !existingIds.has(reference.id)).length;
    } catch (error) {
      this.options.patch({ error: formatAgentError(error) });
      return 0;
    }
  }

  async addPathTextOrDraft(text: string) {
    const value = text.trim();
    if (!value) return false;
    const bridge = this.requireBridge("resolveAgentWorkspaceReferences");
    try {
      const references = (await bridge.resolveAgentWorkspaceReferences({
        rootPath: this.options.workspaceRoot,
        paths: [value],
      })).map((reference) => this.withCapabilityStatus(reference));
      if (references.length === 0) throw new Error("No workspace reference was resolved.");
      const state = this.options.readState();
      const existingIds = new Set(state.references.map((reference) => reference.id));
      const merged = this.mergeAndValidate(state.references, references);
      this.options.patch({ references: merged, error: null });
      return merged.some((reference) => reference.status === "ready" && !existingIds.has(reference.id));
    } catch {
      this.options.appendText(value);
      return false;
    }
  }

  async stageExternalFiles(files: File[]) {
    const bridge = this.requireBridge("stageAgentAttachments");
    const selected = files.slice(0, 32);
    const pending = selected.map((file) => pendingAttachment(file));
    const state = this.options.readState();
    const existingIds = new Set(state.references.map((reference) => reference.id));
    this.options.patch({ references: this.mergeAndValidate(state.references, pending), error: null });
    const completed = await Promise.all(selected.map(async (file, index) => {
      try {
        const [reference] = await bridge.stageAgentAttachments({
          rootPath: this.options.workspaceRoot,
          epoch: this.epoch,
          files: [file],
        });
        if (!reference) throw new Error("The selected attachment was not staged.");
        const supported = this.withCapabilityStatus(reference);
        if (supported.status === "error" && reference.kind === "staged-attachment" && reference.token) {
          await bridge.revokeAgentAttachments?.({ rootPath: this.options.workspaceRoot, tokens: [reference.token] });
          return { ...supported, token: undefined };
        }
        return supported;
      } catch (error) {
        return attachmentReferenceError(file, error);
      } finally {
        const pendingId = pending[index]?.id;
        if (pendingId) {
          const latest = this.options.readState();
          this.options.patch({ references: latest.references.filter((entry) => entry.id !== pendingId) });
        }
      }
    }));
    const merged = this.mergeAndValidate(this.options.readState().references, completed);
    completed.forEach((reference, index) => {
      const mergedReference = merged.find((entry) => entry.id === reference.id);
      if (mergedReference?.status === "error" && selected[index]) {
        this.retryFiles.set(mergedReference.id, selected[index]);
      }
    });
    this.options.patch({ references: merged });
    return merged.filter((reference) => reference.status === "ready" && !existingIds.has(reference.id)).length;
  }

  remove(id: string) {
    const state = this.options.readState();
    const reference = state.references.find((entry) => entry.id === id);
    if (!reference) return;
    this.retryFiles.delete(id);
    this.options.patch({ references: state.references.filter((entry) => entry.id !== id) });
    void this.revoke([reference]);
  }

  retry(id: string) {
    const state = this.options.readState();
    const reference = state.references.find((entry) => entry.id === id);
    if (!reference || reference.status !== "error") return;
    const file = this.retryFiles.get(id);
    this.retryFiles.delete(id);
    this.options.patch({ references: state.references.filter((entry) => entry.id !== id) });
    void (async () => {
      await this.revoke([reference]);
      if (file) await this.stageExternalFiles([file]);
      else if (reference.kind === "workspace-entry") await this.addWorkspacePaths([reference.path]);
    })();
  }

  mergeAndValidate(current: AgentDraftReference[], incoming: AgentDraftReference[]) {
    const capabilities = this.options.readState().inspection?.capabilities?.referenceInputs;
    let count = 0;
    let bytes = 0;
    return mergeAgentReferences(current, incoming).map((original) => {
      if (original.status !== "ready") return original;
      const reference = this.withCapabilityStatus(original);
      if (reference.status !== "ready" || !capabilities) return reference;
      count += 1;
      bytes += reference.size ?? 0;
      if (count > capabilities.maxReferences) {
        return referenceCapabilityError(reference, "reference-limit", "This Agent's reference count limit was reached.");
      }
      if (bytes > capabilities.maxTotalReferenceBytes) {
        return referenceCapabilityError(reference, "reference-total-size", "This Agent's total reference size limit was reached.");
      }
      return reference;
    });
  }

  async revoke(references: AgentDraftReference[]) {
    const tokens = Array.from(new Set(references.flatMap((reference) => (
      reference.kind === "staged-attachment" && reference.token ? [reference.token] : []
    ))));
    if (tokens.length === 0) return;
    const bridge = this.options.bridgeProvider();
    if (!bridge?.revokeAgentAttachments) return;
    await bridge.revokeAgentAttachments({ rootPath: this.options.workspaceRoot, tokens }).catch(() => undefined);
  }

  async rotate(references: AgentDraftReference[]) {
    await this.revoke(references);
    this.retryFiles.clear();
    this.epoch = createReferenceEpoch();
  }

  async reset(references: AgentDraftReference[]) {
    await this.rotate(references);
    this.options.patch({ references: [], pendingIntent: null });
  }

  clearRetryMaterial() {
    this.retryFiles.clear();
  }

  private withCapabilityStatus(reference: AgentDraftReference): AgentDraftReference {
    const failure = unsupportedReferenceFailure(
      reference,
      this.options.readState().inspection?.capabilities?.referenceInputs,
    );
    return failure ? { ...reference, status: "error", error: failure } : reference;
  }

  private requireBridge<K extends keyof AgentClientPort>(...methods: K[]): AgentClientPort {
    const bridge = this.options.bridgeProvider();
    if (!bridge || methods.some((method) => typeof bridge[method] !== "function")) {
      throw new AgentKnownError("native-bridge-unavailable");
    }
    return bridge;
  }
}

function createReferenceEpoch() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function pendingAttachment(file: File): AgentDraftReference {
  return {
    id: `pending-${createReferenceEpoch()}`,
    kind: "staged-attachment",
    displayName: safeReferenceName(file.name),
    mime: file.type || "application/octet-stream",
    size: Number.isFinite(file.size) ? file.size : 0,
    status: "resolving",
  };
}

function attachmentReferenceError(file: File, error: unknown): AgentDraftReference {
  return {
    id: `error-${createReferenceEpoch()}`,
    kind: "staged-attachment",
    displayName: safeReferenceName(file.name),
    mime: file.type || "application/octet-stream",
    size: Number.isFinite(file.size) ? file.size : 0,
    status: "error",
    error: { code: "staging-failed", message: safeReferenceError(error) },
  };
}

function workspaceReferenceError(referencePath: string, error: unknown): AgentDraftReference {
  const displayName = safeReferenceName(referencePath.split(/[\\/]/).filter(Boolean).at(-1) || "workspace item");
  return {
    id: `error-${createReferenceEpoch()}`,
    kind: "workspace-entry",
    entryType: "file",
    path: referencePath.slice(0, 4_096),
    relativePath: displayName,
    displayName,
    status: "error",
    error: { code: "workspace-resolution-failed", message: safeReferenceError(error) },
  };
}

function unsupportedReferenceFailure(
  reference: AgentDraftReference,
  capabilities: AgentReferenceInputCapabilities | undefined,
): { code: string; message: string } | null {
  if (!capabilities) return referenceFailure("capability-unreported", "The selected Agent has not reported reference input support.");
  if ((reference.size ?? 0) > capabilities.maxReferenceBytes) {
    return referenceFailure("reference-size", "This reference exceeds the selected Agent's size limit.");
  }
  if (reference.kind === "workspace-entry") {
    if (reference.entryType === "directory" && !capabilities.workspaceDirectories) {
      return referenceFailure("workspace-directory-unsupported", "The selected Agent does not accept workspace directories.");
    }
    if (reference.entryType === "file" && !capabilities.workspaceFiles) {
      return referenceFailure("workspace-file-unsupported", "The selected Agent does not accept workspace files.");
    }
    return null;
  }
  const image = reference.mime.startsWith("image/");
  if ((image ? capabilities.images : capabilities.genericFiles) === "none") {
    return image
      ? referenceFailure("image-unsupported", "The selected Agent does not accept image attachments.")
      : referenceFailure("file-unsupported", "The selected Agent does not accept this file type.");
  }
  if (capabilities.acceptedMimeTypes?.length && !capabilities.acceptedMimeTypes.includes(reference.mime)) {
    return referenceFailure("mime-unsupported", "The selected Agent does not accept this attachment MIME type.");
  }
  return null;
}

function referenceFailure(code: string, message: string) {
  return { code, message };
}

function referenceCapabilityError(reference: AgentDraftReference, code: string, message: string): AgentDraftReference {
  return { ...reference, status: "error", error: { code, message } };
}

function safeReferenceName(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 512) || "attachment";
}

function safeReferenceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 500) || "The reference could not be added.";
}
