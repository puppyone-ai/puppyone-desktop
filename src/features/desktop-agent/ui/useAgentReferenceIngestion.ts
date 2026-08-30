import { useCallback, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import {
  classifyReferenceDataTransfer,
  hasReferenceDataTransferSource,
  isDataResourceUri,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentSessionController } from "../application/AgentSessionController";
import type { AgentReferenceVisualPreview } from "../application/AgentReferencePreviewStore";
import type { AgentReferenceInputCapabilities } from "../domain/agent-contract";

export type AgentWorkspaceReferenceResolution = Readonly<{
  workspaceRoot: string;
  referencePath: string;
  loadVisualPreview?: () => Promise<AgentReferenceVisualPreview | null>;
}>;

export type AgentWorkspaceReferenceResolver = (
  resource: string,
) => AgentWorkspaceReferenceResolution | null | Promise<AgentWorkspaceReferenceResolution | null>;

export function useAgentReferenceIngestion({
  controller,
  workspaceId,
  capabilities,
  resolveWorkspaceReference,
}: {
  controller: AgentSessionController;
  workspaceId: string;
  capabilities?: AgentReferenceInputCapabilities;
  resolveWorkspaceReference?: AgentWorkspaceReferenceResolver;
}) {
  const { t } = useLocalization();
  const dragDepth = useRef(0);
  const [dropActive, setDropActive] = useState(false);
  const [dropInvalid, setDropInvalid] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const announceBatchResult = useCallback((beforeIds: Set<string>, count: number) => {
    const failed = controller.getSnapshot().references
      .filter((reference) => reference.status === "error" && !beforeIds.has(reference.id)).length;
    setAnnouncement(failed > 0
      ? t("agent.reference.batchPartial", { count, failed })
      : t("agent.reference.batchResult", { count }));
  }, [controller, t]);

  const onDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasReferenceDataTransferSource(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current += 1;
    setDropActive(true);
    setDropInvalid(!canIngestDataTransfer(event.dataTransfer, workspaceId, capabilities));
  }, [capabilities, workspaceId]);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasReferenceDataTransferSource(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!dropActive) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDropActive(false);
      setDropInvalid(false);
    }
  }, [dropActive]);

  const onDrop = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasReferenceDataTransferSource(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDropActive(false);
    setDropInvalid(false);
    const beforeIds = new Set(controller.getSnapshot().references.map((reference) => reference.id));
    void ingestDataTransfer(
      event.dataTransfer,
      workspaceId,
      controller,
      resolveWorkspaceReference,
    ).then((result) => {
      setAnnouncement(result === "workspace-mismatch"
        ? t("agent.reference.workspaceMismatch")
        : result === "resource-unavailable"
          ? t("agent.reference.resourceUnavailable")
          : "");
      if (typeof result === "number") announceBatchResult(beforeIds, result);
    });
  }, [announceBatchResult, controller, resolveWorkspaceReference, t, workspaceId]);

  const onPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    event.preventDefault();
    const beforeIds = new Set(controller.getSnapshot().references.map((reference) => reference.id));
    void controller.stageExternalFiles(images).then((count) => {
      announceBatchResult(beforeIds, count);
    });
  }, [announceBatchResult, controller]);

  const addExternalFiles = useCallback((files: File[]) => {
    const beforeIds = new Set(controller.getSnapshot().references.map((reference) => reference.id));
    void controller.stageExternalFiles(files).then((count) => {
      announceBatchResult(beforeIds, count);
    });
  }, [announceBatchResult, controller]);

  const pickWorkspaceReferences = useCallback(() => {
    const beforeIds = new Set(controller.getSnapshot().references.map((reference) => reference.id));
    void controller.pickWorkspaceReferences().then((count) => {
      announceBatchResult(beforeIds, count);
    });
  }, [announceBatchResult, controller]);

  return {
    dropActive,
    dropInvalid,
    dropLabel: t(dropInvalid ? "agent.reference.dropUnsupported" : "agent.reference.dropLabel"),
    announcement,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onPaste,
    addExternalFiles,
    pickWorkspaceReferences,
  };
}

function canIngestDataTransfer(
  dataTransfer: DataTransfer,
  workspaceId: string,
  capabilities: AgentReferenceInputCapabilities | undefined,
) {
  const source = classifyReferenceDataTransfer(dataTransfer);
  if (source.kind === "text") return true;
  if (source.kind === "none") {
    const types = Array.from(dataTransfer.types ?? []);
    if (types.includes("Files")) return Boolean(capabilities
      && (capabilities.images !== "none" || capabilities.genericFiles !== "none"));
    return true;
  }
  if (!capabilities) return false;
  if (source.kind === "workspace-entries") {
    if (source.workspaceId && source.workspaceId !== workspaceId) return false;
    return source.entries.every((entry) => entry.entryType === "directory"
      ? capabilities.workspaceDirectories
      : capabilities.workspaceFiles);
  }
  if (source.files.length === 0) {
    return capabilities.images !== "none" || capabilities.genericFiles !== "none";
  }
  return source.files.every((file) => {
    const transport = file.type.startsWith("image/") ? capabilities.images : capabilities.genericFiles;
    return transport !== "none"
      && (!capabilities.acceptedMimeTypes?.length || capabilities.acceptedMimeTypes.includes(file.type));
  });
}

async function ingestDataTransfer(
  dataTransfer: DataTransfer,
  workspaceId: string,
  controller: AgentSessionController,
  resolveWorkspaceReference: AgentWorkspaceReferenceResolver | undefined,
): Promise<number | "workspace-mismatch" | "resource-unavailable"> {
  const source = classifyReferenceDataTransfer(dataTransfer);
  if (source.kind === "workspace-entries") {
    if (source.workspaceId && source.workspaceId !== workspaceId) return "workspace-mismatch";
    const paths: string[] = [];
    const resolutions: AgentWorkspaceReferenceResolution[] = [];
    for (const entry of source.entries) {
      if (!isDataResourceUri(entry.path)) {
        paths.push(entry.path);
        continue;
      }
      const resolved = await resolveWorkspaceReference?.(entry.path) ?? null;
      if (!resolved) return "resource-unavailable";
      if (resolved.workspaceRoot !== controller.workspaceRoot) return "workspace-mismatch";
      paths.push(resolved.referencePath);
      resolutions.push(resolved);
    }
    const visualPreviews = new Map<string, AgentReferenceVisualPreview>();
    await Promise.all(resolutions.map(async (resolved) => {
      if (!resolved.loadVisualPreview) return;
      const preview = await resolved.loadVisualPreview().catch(() => null);
      if (preview) {
        try {
          visualPreviews.get(resolved.referencePath)?.release?.();
        } catch {
          // A stale duplicate preview must not block the valid reference.
        }
        visualPreviews.set(resolved.referencePath, preview);
      }
    }));
    return controller.addWorkspacePaths(paths, visualPreviews);
  }
  if (source.kind === "files") return controller.stageExternalFiles(source.files);
  if (source.kind === "text") return (await controller.addPathTextOrDraft(source.text)) ? 1 : 0;
  return 0;
}
