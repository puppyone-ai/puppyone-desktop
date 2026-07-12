"use client";

import { Annotation, Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  markdownCodeMirrorLanguageExtension,
  markdownCodeMirrorUrgentExtensions,
  markdownLivePreviewCoreExtension,
} from "./markdownCodeMirrorExtensions";
import { markdownLivePreviewContextExtension } from "./core/editor/markdownLivePreviewContext";
import { markdownAiEditExtension } from "./core/editor/markdownAiEditExtension";
import { getDocRevision } from "./platform/brokers/transactionBroker";
import type { AiEditFile } from "../ai-edits/types";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../viewerTypes";
import type {
  EditorSourceRevision,
  EditorSourceSnapshot,
  EditorSourceSnapshotPort,
} from "../sourceSnapshot";
import { getRendererPerformanceTracker } from "../../performance/rendererPerformance";
import { subscribeTypographyChanges } from "../../core/typography";

const rendererPerformance = getRendererPerformanceTracker();

export type MarkdownCodeMirrorEditorProps = {
  value: string;
  readOnly: boolean;
  livePreview: boolean;
  aiEditFile?: AiEditFile | null;
  htmlTrustMode?: MarkdownHtmlTrustMode;
  documentPath?: string;
  workspaceId?: string;
  workspaceRoot?: string | null;
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  /** Legacy controlled boundary. Product Markdown surfaces use snapshot ports. */
  onChange?: (value: string) => void;
  onSourceRevisionChange?: (revision: EditorSourceRevision) => void;
  onSnapshotPortChange?: (port: EditorSourceSnapshotPort | null) => void;
  onBeforeDestroy?: (snapshot: EditorSourceSnapshot) => void;
  onEditorBaseReady?: (revision: string) => void;
  onPreviewReady?: (revision: string) => void;
  onPreviewError?: (error: Error) => void;
};

const externalDocumentUpdate = Annotation.define<boolean>();
const PREVIEW_PENDING_MESSAGE_DELAY_MS = 150;

export type MarkdownPreviewPresentationState = "source" | "pending" | "ready" | "error";

export function MarkdownCodeMirrorEditor({
  value,
  readOnly,
  livePreview,
  aiEditFile = null,
  htmlTrustMode = "safe",
  documentPath = "",
  workspaceId = "",
  workspaceRoot = null,
  markdownLinkGraph = null,
  markdownAssetUrlResolver = null,
  onChange,
  onSourceRevisionChange,
  onSnapshotPortChange,
  onBeforeDestroy,
  onEditorBaseReady,
  onPreviewReady,
  onPreviewError,
}: MarkdownCodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const externalValueRef = useRef(value);
  const documentPathRef = useRef(documentPath);
  documentPathRef.current = documentPath;
  const callbacksRef = useRef({
    onChange,
    onSourceRevisionChange,
    onSnapshotPortChange,
    onBeforeDestroy,
    onEditorBaseReady,
    onPreviewReady,
    onPreviewError,
  });
  callbacksRef.current = {
    onChange,
    onSourceRevisionChange,
    onSnapshotPortChange,
    onBeforeDestroy,
    onEditorBaseReady,
    onPreviewReady,
    onPreviewError,
  };
  const editableCompartmentRef = useRef(new Compartment());
  const languageCompartmentRef = useRef(new Compartment());
  const livePreviewCoreCompartmentRef = useRef(new Compartment());
  const livePreviewContextCompartmentRef = useRef(new Compartment());
  const aiEditCompartmentRef = useRef(new Compartment());
  const initialEditorConfigRef = useRef({ aiEditFile, readOnly, value });
  const previewActivatedRef = useRef(false);
  const previewGenerationRef = useRef(0);
  const [previewState, setPreviewState] = useState<MarkdownPreviewPresentationState>(
    () => livePreview ? "pending" : "source",
  );
  const [showPendingMessage, setShowPendingMessage] = useState(false);
  const livePreviewContextRef = useRef({
    htmlTrustMode,
    markdownLinkGraph,
    documentPath,
    markdownAssetUrlResolver,
    workspaceId,
    workspaceRoot,
  });
  livePreviewContextRef.current = {
    htmlTrustMode,
    markdownLinkGraph,
    documentPath,
    markdownAssetUrlResolver,
    workspaceId,
    workspaceRoot,
  };

  useLayoutEffect(() => {
    previewGenerationRef.current += 1;
    previewActivatedRef.current = false;
    setShowPendingMessage(false);
    setPreviewState(livePreview ? "pending" : "source");

    if (livePreview) return;
    const view = viewRef.current;
    if (!view) return;
    try {
      view.dispatch({
        effects: [
          livePreviewContextCompartmentRef.current.reconfigure([]),
          livePreviewCoreCompartmentRef.current.reconfigure([]),
        ],
      });
    } catch (error) {
      callbacksRef.current.onPreviewError?.(toError(error));
    }
  }, [documentPath, livePreview]);

  useEffect(() => {
    if (previewState !== "pending") {
      setShowPendingMessage(false);
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      setShowPendingMessage(true);
    }, PREVIEW_PENDING_MESSAGE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [previewState]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const initialConfig = initialEditorConfigRef.current;

    const editorCreateStartedAt = performance.now();
    const view = new EditorView({
      parent: host,
      dispatchTransactions: (transactions, targetView) => {
        const startedAt = performance.now();
        targetView.update(transactions);
        if (transactions.some((transaction) => (
          transaction.docChanged
          && !transaction.annotation(externalDocumentUpdate)
        ))) {
          rendererPerformance.recordInputTransaction(performance.now() - startedAt);
        }
      },
      state: EditorState.create({
        doc: initialConfig.value,
        extensions: [
          ...markdownCodeMirrorUrgentExtensions(initialConfig.readOnly),
          editableCompartmentRef.current.of(getEditableExtensions(initialConfig.readOnly)),
          languageCompartmentRef.current.of([]),
          livePreviewContextCompartmentRef.current.of([]),
          livePreviewCoreCompartmentRef.current.of([]),
          aiEditCompartmentRef.current.of(markdownAiEditExtension(initialConfig.aiEditFile)),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.some((transaction) => transaction.annotation(externalDocumentUpdate))) return;
            const revision = getDocRevision(update.state.doc);
            callbacksRef.current.onSourceRevisionChange?.({ revision, dirty: true });
            // Compatibility only. The main Markdown persistence path never
            // supplies this callback, so ordinary typing does not stringify.
            if (callbacksRef.current.onChange) {
              callbacksRef.current.onChange(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    rendererPerformance.recordOperation(
      "editor_base_create",
      performance.now() - editorCreateStartedAt,
    );

    viewRef.current = view;
    const unsubscribeTypography = subscribeTypographyChanges(host.ownerDocument, () => {
      view.requestMeasure();
    });
    const snapshotPort: EditorSourceSnapshotPort = {
      readSnapshot: () => readEditorSnapshot(view),
      readRevision: () => getDocRevision(view.state.doc),
    };
    callbacksRef.current.onSnapshotPortChange?.(snapshotPort);
    const baseRevision = getDocRevision(view.state.doc);
    callbacksRef.current.onSourceRevisionChange?.({ revision: baseRevision, dirty: false });
    callbacksRef.current.onEditorBaseReady?.(baseRevision);
    if (documentPathRef.current) {
      rendererPerformance.markActiveDocument(documentPathRef.current, "editor_base_ready");
    }

    return () => {
      previewGenerationRef.current += 1;
      unsubscribeTypography();
      const snapshotStartedAt = performance.now();
      const snapshot = readEditorSnapshot(view);
      rendererPerformance.recordOperation(
        "editor_snapshot_read",
        performance.now() - snapshotStartedAt,
      );
      callbacksRef.current.onBeforeDestroy?.(snapshot);
      callbacksRef.current.onSnapshotPortChange?.(null);
      const destroyStartedAt = performance.now();
      view.destroy();
      rendererPerformance.recordOperation(
        "editor_destroy",
        performance.now() - destroyStartedAt,
      );
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure(getEditableExtensions(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return undefined;

    const generation = previewGenerationRef.current;
    let cancelled = false;
    let languageTask: CancellableRendererTask | null = null;
    let previewTask: CancellableRendererTask | null = null;
    let readyFrame: number | null = null;

    const isCurrent = () => (
      !cancelled
      && viewRef.current === view
      && previewGenerationRef.current === generation
    );
    const failPreview = (cause: unknown) => {
      if (!isCurrent()) return;
      const error = toError(cause);
      previewActivatedRef.current = false;
      setPreviewState("error");
      callbacksRef.current.onPreviewError?.(error);
    };
    const confirmPreviewPaint = () => {
      if (!isCurrent()) return;
      const candidateRevision = getDocRevision(view.state.doc);
      readyFrame = window.requestAnimationFrame(() => {
        readyFrame = null;
        if (!isCurrent()) return;
        const paintedRevision = getDocRevision(view.state.doc);
        if (paintedRevision !== candidateRevision) {
          confirmPreviewPaint();
          return;
        }
        setPreviewState("ready");
        callbacksRef.current.onPreviewReady?.(paintedRevision);
        if (documentPathRef.current) {
          rendererPerformance.markActiveDocument(documentPathRef.current, "preview_ready");
        }
      });
    };

    languageTask = scheduleRendererTask(() => {
      languageTask = null;
      if (!isCurrent()) return;
      const languageStartedAt = performance.now();
      try {
        view.dispatch({
          effects: languageCompartmentRef.current.reconfigure(markdownCodeMirrorLanguageExtension()),
        });
      } catch (error) {
        if (livePreview) failPreview(error);
        else console.warn("Unable to activate Markdown language support:", error);
        return;
      }
      rendererPerformance.recordOperation(
        "markdown_language_activate",
        performance.now() - languageStartedAt,
      );
      if (documentPathRef.current) {
        rendererPerformance.markActiveDocument(documentPathRef.current, "markdown_language_ready");
      }
      if (!livePreview) return;

      previewTask = scheduleRendererTask(() => {
        previewTask = null;
        if (!isCurrent()) return;
        const context = livePreviewContextRef.current;
        previewActivatedRef.current = true;
        const previewStartedAt = performance.now();
        try {
          view.dispatch({
            effects: [
              livePreviewContextCompartmentRef.current.reconfigure(
                markdownLivePreviewContextExtension(
                  context.htmlTrustMode,
                  context.markdownLinkGraph,
                  context.documentPath,
                  context.markdownAssetUrlResolver,
                  context.workspaceId,
                  context.workspaceRoot,
                ),
              ),
              livePreviewCoreCompartmentRef.current.reconfigure(
                markdownLivePreviewCoreExtension(),
              ),
            ],
          });
        } catch (error) {
          failPreview(error);
          return;
        }
        rendererPerformance.recordOperation(
          "markdown_preview_activate",
          performance.now() - previewStartedAt,
        );
        confirmPreviewPaint();
      });
    });

    return () => {
      cancelled = true;
      previewActivatedRef.current = false;
      languageTask?.cancel();
      previewTask?.cancel();
      if (readyFrame !== null) window.cancelAnimationFrame(readyFrame);
    };
  }, [documentPath, livePreview]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !livePreview || !previewActivatedRef.current) return undefined;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled || viewRef.current !== view || !previewActivatedRef.current) return;
      const context = livePreviewContextRef.current;
      view.dispatch({
        effects: livePreviewContextCompartmentRef.current.reconfigure(
          markdownLivePreviewContextExtension(
            context.htmlTrustMode,
            context.markdownLinkGraph,
            context.documentPath,
            context.markdownAssetUrlResolver,
            context.workspaceId,
            context.workspaceRoot,
          ),
        ),
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [
    documentPath,
    htmlTrustMode,
    livePreview,
    markdownAssetUrlResolver,
    markdownLinkGraph,
    workspaceId,
    workspaceRoot,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    try {
      view.dispatch({
        effects: aiEditCompartmentRef.current.reconfigure(markdownAiEditExtension(aiEditFile)),
      });
    } catch (error) {
      console.warn("Unable to apply AI edit decorations:", error);
      view.dispatch({
        effects: aiEditCompartmentRef.current.reconfigure([]),
      });
    }
  }, [aiEditFile]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || Object.is(externalValueRef.current, value)) return;
    externalValueRef.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalDocumentUpdate.of(true),
    });
    callbacksRef.current.onSourceRevisionChange?.({
      revision: getDocRevision(view.state.doc),
      dirty: false,
    });
  }, [value]);

  const previewMessage = previewState === "error"
    ? "Live Preview unavailable — showing Markdown source."
    : previewState === "pending" && showPendingMessage
      ? "Preparing preview…"
      : null;

  return (
    <>
      <div
        ref={hostRef}
        className="markdown-codemirror-editor"
        data-live-preview={livePreview ? "true" : "false"}
        data-preview-state={previewState}
        data-preview-message={previewMessage ?? undefined}
        data-readonly={readOnly ? "true" : "false"}
        aria-busy={previewState === "pending"}
      />
      <span
        className="markdown-preview-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {previewMessage ?? ""}
      </span>
    </>
  );
}

function readEditorSnapshot(view: EditorView): EditorSourceSnapshot {
  return {
    content: view.state.doc.toString(),
    revision: getDocRevision(view.state.doc),
  };
}

function getEditableExtensions(readOnly: boolean): Extension[] {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
  ];
}

type CancellableRendererTask = {
  cancel(): void;
};

function scheduleRendererTask(callback: () => void): CancellableRendererTask {
  const schedulerApi = (globalThis as typeof globalThis & {
    scheduler?: {
      postTask(
        task: () => void,
        options?: { priority?: "user-blocking" | "user-visible" | "background"; signal?: AbortSignal },
      ): Promise<unknown>;
    };
  }).scheduler;
  if (schedulerApi?.postTask) {
    const controller = new AbortController();
    let taskStarted = false;
    let fallbackTimeoutId: number | null = null;
    void schedulerApi.postTask(() => {
      taskStarted = true;
      callback();
    }, {
      priority: "user-blocking",
      signal: controller.signal,
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      if (taskStarted) {
        console.warn("Markdown activation task failed after starting:", error);
        return;
      }
      console.warn("Unable to schedule Markdown activation task; using timer fallback:", error);
      if (controller.signal.aborted) return;
      fallbackTimeoutId = window.setTimeout(callback, 0);
    });
    return {
      cancel: () => {
        controller.abort();
        if (fallbackTimeoutId !== null) window.clearTimeout(fallbackTimeoutId);
      },
    };
  }

  const timeoutId = window.setTimeout(callback, 0);
  return { cancel: () => window.clearTimeout(timeoutId) };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
