import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from "react";
import {
  Check,
  CircleAlert,
  CircleQuestionMark,
  ImagePlus,
  LoaderCircle,
  Send,
  Trash2,
} from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import "./desktop-help-launcher.css";

type SubmissionState = "idle" | "sending" | "sent" | "error";
type AttachmentState = "idle" | "processing" | "error";
type FeedbackScreenshotMimeType = "image/jpeg" | "image/png" | "image/webp";
type FeedbackScreenshot = {
  bytes: ArrayBuffer;
  mimeType: FeedbackScreenshotMimeType;
  previewUrl: string;
};

const FEEDBACK_MAX_LENGTH = 2_000;
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
const MAX_SOURCE_SCREENSHOT_BYTES = 20 * 1024 * 1024;
const MAX_SCREENSHOT_EDGE = 1_920;
const SUCCESS_CLOSE_DELAY_MS = 1_200;
const SUPPORTED_SCREENSHOT_TYPES = new Set<FeedbackScreenshotMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * A deliberately quiet, shell-level feedback affordance.
 * Keeping it inside the main surface means auxiliary Chat and Terminal panels
 * always receive their full input area when they open.
 */
export function DesktopHelpLauncher() {
  const { locale, t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [attachmentState, setAttachmentState] = useState<AttachmentState>("idle");
  const [attachmentError, setAttachmentError] = useState("");
  const [screenshot, setScreenshot] = useState<FeedbackScreenshot | null>(null);
  const [draggingScreenshot, setDraggingScreenshot] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotRef = useRef<FeedbackScreenshot | null>(null);
  const submissionIdRef = useRef(0);
  const attachmentIdRef = useRef(0);
  const label = t("shell.feedback.label");

  const replaceScreenshot = useCallback((nextScreenshot: FeedbackScreenshot | null) => {
    const currentScreenshot = screenshotRef.current;
    if (
      currentScreenshot?.previewUrl
      && currentScreenshot.previewUrl !== nextScreenshot?.previewUrl
    ) {
      URL.revokeObjectURL(currentScreenshot.previewUrl);
    }
    screenshotRef.current = nextScreenshot;
    setScreenshot(nextScreenshot);
  }, []);

  const close = useCallback(() => {
    submissionIdRef.current += 1;
    attachmentIdRef.current += 1;
    setOpen(false);
    setMessage("");
    setSubmissionState("idle");
    setAttachmentState("idle");
    setAttachmentError("");
    setDraggingScreenshot(false);
    replaceScreenshot(null);
  }, [replaceScreenshot]);

  useEffect(() => {
    if (!open) return undefined;

    textareaRef.current?.focus({ preventScroll: true });
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      close();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [close, open]);

  useEffect(() => () => {
    const previewUrl = screenshotRef.current?.previewUrl;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, []);

  useEffect(() => {
    if (submissionState !== "sent") return undefined;
    const timer = window.setTimeout(close, SUCCESS_CLOSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [close, submissionState]);

  const handleLauncherClick = () => {
    if (open) {
      close();
      return;
    }
    setSubmissionState("idle");
    setOpen(true);
  };

  const attachScreenshot = useCallback(async (file: File) => {
    const attachmentId = attachmentIdRef.current + 1;
    attachmentIdRef.current = attachmentId;
    setAttachmentState("processing");
    setAttachmentError("");

    try {
      const nextScreenshot = await prepareFeedbackScreenshot(file);
      if (attachmentIdRef.current !== attachmentId) {
        URL.revokeObjectURL(nextScreenshot.previewUrl);
        return;
      }
      replaceScreenshot(nextScreenshot);
      setAttachmentState("idle");
      textareaRef.current?.focus({ preventScroll: true });
    } catch (error) {
      if (attachmentIdRef.current !== attachmentId) return;
      setAttachmentState("error");
      setAttachmentError(
        error instanceof ScreenshotPreparationError && error.code === "unsupported"
          ? t("shell.feedback.screenshotUnsupported")
          : t("shell.feedback.screenshotTooLarge"),
      );
    }
  }, [replaceScreenshot, t]);

  const handleScreenshotInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (file) void attachScreenshot(file);
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const screenshotFile = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();
    if (!screenshotFile) return;
    event.preventDefault();
    void attachScreenshot(screenshotFile);
  };

  const handleDrop = (event: ReactDragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDraggingScreenshot(false);
    const screenshotFile = Array.from(event.dataTransfer.files)
      .find((file) => file.type.startsWith("image/"));
    if (screenshotFile) void attachScreenshot(screenshotFile);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    const submitFeedback = window.puppyoneDesktop?.submitFeedback;
    if ((!trimmedMessage && !screenshot) || !submitFeedback) {
      setSubmissionState("error");
      return;
    }

    const submissionId = submissionIdRef.current + 1;
    submissionIdRef.current = submissionId;
    setSubmissionState("sending");

    try {
      await submitFeedback({
        message: trimmedMessage,
        locale,
        ...(screenshot
          ? {
            screenshot: {
              bytes: screenshot.bytes,
              mimeType: screenshot.mimeType,
            },
          }
          : {}),
      });
      if (submissionIdRef.current !== submissionId) return;
      setSubmissionState("sent");
    } catch {
      if (submissionIdRef.current !== submissionId) return;
      setSubmissionState("error");
    }
  };

  const canSend =
    (Boolean(message.trim()) || Boolean(screenshot))
    && submissionState !== "sending"
    && submissionState !== "sent"
    && attachmentState !== "processing";
  const sendLabel =
    submissionState === "sending"
      ? t("shell.feedback.sending")
      : submissionState === "sent"
        ? t("shell.feedback.sent")
        : submissionState === "error"
          ? t("shell.feedback.error")
          : t("shell.feedback.send");
  const liveStatus =
    submissionState === "sending"
      ? t("shell.feedback.sending")
      : submissionState === "sent"
        ? t("shell.feedback.sent")
        : submissionState === "error"
          ? t("shell.feedback.error")
          : attachmentError;

  return (
    <div
      ref={rootRef}
      className="desktop-feedback"
      data-open={open ? "true" : undefined}
    >
      {open ? (
        <form
          className="desktop-feedback-popover desktop-feedback-composer"
          role="dialog"
          aria-label={label}
          aria-busy={submissionState === "sending" || attachmentState === "processing"}
          data-dragging={draggingScreenshot ? "true" : undefined}
          onSubmit={handleSubmit}
          onDragEnter={(event) => {
            if (!Array.from(event.dataTransfer.types).includes("Files")) return;
            event.preventDefault();
            setDraggingScreenshot(true);
          }}
          onDragOver={(event) => {
            if (!Array.from(event.dataTransfer.types).includes("Files")) return;
            event.preventDefault();
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDraggingScreenshot(false);
          }}
          onDrop={handleDrop}
        >
          <textarea
            ref={textareaRef}
            value={message}
            maxLength={FEEDBACK_MAX_LENGTH}
            disabled={submissionState === "sending" || submissionState === "sent"}
            aria-label={t("shell.feedback.messageLabel")}
            placeholder={t("shell.feedback.placeholder")}
            onPaste={handlePaste}
            onChange={(event) => {
              setMessage(event.currentTarget.value);
              if (submissionState === "error") setSubmissionState("idle");
            }}
          />

          <div className="desktop-feedback-composer-toolbar">
            <div className="desktop-feedback-attachment-slot">
              <input
                ref={fileInputRef}
                className="desktop-feedback-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                tabIndex={-1}
                onChange={handleScreenshotInput}
              />
              {screenshot ? (
                <button
                  className="desktop-feedback-screenshot"
                  type="button"
                  aria-label={t("shell.feedback.removeScreenshot")}
                  title={t("shell.feedback.removeScreenshot")}
                  disabled={submissionState === "sending" || submissionState === "sent"}
                  onClick={() => {
                    replaceScreenshot(null);
                    setAttachmentError("");
                    setAttachmentState("idle");
                  }}
                >
                  <img src={screenshot.previewUrl} alt="" />
                  <span aria-hidden="true">
                    <Trash2 size={12} strokeWidth={1.9} />
                  </span>
                </button>
              ) : (
                <button
                  className="desktop-feedback-attach"
                  type="button"
                  aria-label={t("shell.feedback.attachScreenshot")}
                  title={t("shell.feedback.attachScreenshot")}
                  disabled={
                    attachmentState === "processing"
                    || submissionState === "sending"
                    || submissionState === "sent"
                  }
                  onClick={() => fileInputRef.current?.click()}
                >
                  {attachmentState === "processing" ? (
                    <LoaderCircle
                      className="desktop-feedback-spinner"
                      size={16}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  ) : (
                    <ImagePlus size={16} strokeWidth={1.7} aria-hidden="true" />
                  )}
                </button>
              )}
              {attachmentState === "error" && attachmentError ? (
                <span
                  className="desktop-feedback-attachment-error"
                  role="img"
                  aria-label={attachmentError}
                  title={attachmentError}
                >
                  <CircleAlert size={14} strokeWidth={1.8} aria-hidden="true" />
                </span>
              ) : null}
            </div>

            <button
              className="desktop-feedback-submit"
              type="submit"
              aria-label={sendLabel}
              title={sendLabel}
              data-state={submissionState}
              disabled={!canSend}
            >
              {submissionState === "sending" ? (
                <LoaderCircle
                  className="desktop-feedback-spinner"
                  size={15}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              ) : submissionState === "sent" ? (
                <Check size={15} strokeWidth={2} aria-hidden="true" />
              ) : submissionState === "error" ? (
                <CircleAlert size={15} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <Send size={15} strokeWidth={1.9} aria-hidden="true" />
              )}
            </button>
          </div>

          <span className="desktop-feedback-status" aria-live="polite">
            {liveStatus}
          </span>
        </form>
      ) : null}

      <button
        className="desktop-help-launcher"
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleLauncherClick}
      >
        <CircleQuestionMark size={17} strokeWidth={1.65} aria-hidden="true" />
        <span className="desktop-help-launcher-label" aria-hidden="true">
          {label}
        </span>
      </button>
    </div>
  );
}

class ScreenshotPreparationError extends Error {
  constructor(readonly code: "unsupported" | "too-large") {
    super(code);
  }
}

async function prepareFeedbackScreenshot(file: File): Promise<FeedbackScreenshot> {
  const mimeType = normalizeScreenshotMimeType(file.type);
  if (!mimeType || file.size <= 0 || file.size > MAX_SOURCE_SCREENSHOT_BYTES) {
    throw new ScreenshotPreparationError(
      mimeType ? "too-large" : "unsupported",
    );
  }

  let screenshotBlob: Blob = file;
  if (file.size > MAX_SCREENSHOT_BYTES) {
    screenshotBlob = await compressFeedbackScreenshot(file);
  }
  if (screenshotBlob.size > MAX_SCREENSHOT_BYTES) {
    throw new ScreenshotPreparationError("too-large");
  }

  return {
    bytes: await screenshotBlob.arrayBuffer(),
    mimeType: normalizeScreenshotMimeType(screenshotBlob.type) || mimeType,
    previewUrl: URL.createObjectURL(screenshotBlob),
  };
}

async function compressFeedbackScreenshot(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") {
    throw new ScreenshotPreparationError("too-large");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      MAX_SCREENSHOT_EDGE / bitmap.width,
      MAX_SCREENSHOT_EDGE / bitmap.height,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new ScreenshotPreparationError("too-large");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const compressed = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.8);
    });
    if (!compressed) throw new ScreenshotPreparationError("too-large");
    return compressed;
  } finally {
    bitmap.close();
  }
}

function normalizeScreenshotMimeType(value: string): FeedbackScreenshotMimeType | null {
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_SCREENSHOT_TYPES.has(normalized as FeedbackScreenshotMimeType)
    ? normalized as FeedbackScreenshotMimeType
    : null;
}
